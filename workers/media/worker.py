"""
Media Worker - Polls for jobs and processes videos.
"""
import os
import sys
import time
import json
import signal
import logging
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor
from supabase import create_client

from config import Config
from handlers.video_process import VideoProcessHandler
from handlers.transcribe import TranscribeHandler
from handlers.pose_analyze import PoseAnalyzeHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class MediaWorker:
    """Worker that polls for jobs and dispatches to handlers."""

    def __init__(self):
        Config.validate()
        
        self.running = True
        self.conn = None
        self.supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)
        
        # Ensure temp directory exists
        os.makedirs(Config.TEMP_DIR, exist_ok=True)
        
        # Register handlers
        self.handlers = {
            "video_process": VideoProcessHandler(self.supabase, Config.TEMP_DIR),
            "transcribe": TranscribeHandler(self.supabase, Config.TEMP_DIR),
            "pose_analyze": PoseAnalyzeHandler(self.supabase, Config.TEMP_DIR),
        }
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle graceful shutdown."""
        logger.info("Shutdown signal received, finishing current job...")
        self.running = False

    def _connect_db(self):
        """Connect to PostgreSQL database."""
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(Config.DATABASE_URL)
            self.conn.autocommit = False
            logger.info("Connected to database")
        return self.conn

    def _get_next_job(self):
        """Get the next queued job."""
        conn = self._connect_db()
        
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Lock and fetch next queued job
            cur.execute("""
                UPDATE jobs
                SET status = 'running', updated_at = NOW()
                WHERE id = (
                    SELECT id FROM jobs
                    WHERE status = 'queued'
                    ORDER BY created_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                RETURNING *
            """)
            
            job = cur.fetchone()
            conn.commit()
            
            return dict(job) if job else None

    def _complete_job(self, job_id: str, output: dict):
        """Mark job as succeeded."""
        conn = self._connect_db()
        
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE jobs
                SET status = 'succeeded', output = %s, updated_at = NOW()
                WHERE id = %s
            """, (json.dumps(output), job_id))
            conn.commit()

    def _fail_job(self, job_id: str, error: str):
        """Mark job as failed."""
        conn = self._connect_db()
        
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE jobs
                SET status = 'failed', error = %s, updated_at = NOW()
                WHERE id = %s
            """, (error, job_id))
            conn.commit()

    def _process_job(self, job: dict):
        """Process a single job."""
        job_id = job["id"]
        job_type = job["type"]
        job_input = job["input"]
        
        logger.info(f"Processing job {job_id} (type: {job_type})")
        
        handler = self.handlers.get(job_type)
        
        if not handler:
            self._fail_job(job_id, f"Unknown job type: {job_type}")
            return
        
        try:
            result = handler.process(job_id, job_input)
            
            if result.get("success"):
                self._complete_job(job_id, result.get("output", {}))
                logger.info(f"Job {job_id} completed successfully")
            else:
                self._fail_job(job_id, result.get("error", "Unknown error"))
                logger.error(f"Job {job_id} failed: {result.get('error')}")
                
        except Exception as e:
            error_msg = str(e)
            self._fail_job(job_id, error_msg)
            logger.exception(f"Job {job_id} failed with exception")

    def run(self):
        """Main worker loop."""
        logger.info("Media Worker starting...")
        logger.info(f"Polling interval: {Config.POLL_INTERVAL}s")
        
        while self.running:
            try:
                job = self._get_next_job()
                
                if job:
                    self._process_job(job)
                else:
                    # No jobs, sleep before polling again
                    time.sleep(Config.POLL_INTERVAL)
                    
            except psycopg2.Error as e:
                logger.error(f"Database error: {e}")
                # Reset connection
                if self.conn:
                    try:
                        self.conn.close()
                    except:
                        pass
                    self.conn = None
                time.sleep(5)
                
            except Exception as e:
                logger.exception("Unexpected error in worker loop")
                time.sleep(5)
        
        logger.info("Media Worker stopped")
        
        # Cleanup
        if self.conn:
            self.conn.close()


if __name__ == "__main__":
    worker = MediaWorker()
    worker.run()

