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
from handlers.thumbnail_generate import ThumbnailGenerateHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

DEBUG_LOG_PATH = "/Users/hc/Documents/GitHub/Vibe---Youtube-Workflow/.cursor/debug.log"

def _debug_log(hypothesis_id: str, location: str, message: str, data: dict):
    """Write NDJSON debug log line (avoid secrets)."""
    try:
        payload = {
            "sessionId": "debug-session",
            "runId": "media-fix",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open(DEBUG_LOG_PATH, "a") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception:
        pass


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
            "thumbnail_generate": ThumbnailGenerateHandler(self.supabase, Config.TEMP_DIR),
        }
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle graceful shutdown."""
        logger.info("Shutdown signal received, finishing current job...")
        self.running = False

    def _connect_db(self, force_reconnect=False):
        """Connect to PostgreSQL database."""
        if force_reconnect or self.conn is None or self.conn.closed:
            # Close existing connection if any
            if self.conn:
                try:
                    self.conn.close()
                except:
                    pass
            
            self.conn = psycopg2.connect(Config.DATABASE_URL)
            self.conn.autocommit = False
            logger.info("Connected to database")
        return self.conn
    
    def _execute_with_retry(self, operation, *args, max_retries=3):
        """Execute a database operation with automatic retry on connection errors."""
        for attempt in range(max_retries):
            try:
                # Force reconnect on retry attempts
                if attempt > 0:
                    logger.info(f"Retry attempt {attempt + 1}/{max_retries}")
                    self._connect_db(force_reconnect=True)
                
                return operation(*args)
            
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                logger.warning(f"Database connection error (attempt {attempt + 1}/{max_retries}): {e}")
                
                # Reset connection
                if self.conn:
                    try:
                        self.conn.close()
                    except:
                        pass
                    self.conn = None
                
                if attempt == max_retries - 1:
                    # Last attempt failed, re-raise
                    raise
                
                time.sleep(1)  # Brief pause before retry

    def _get_next_job(self):
        """Get the next queued job."""
        # Use fresh connection for each poll to avoid stale connections
        conn = self._connect_db(force_reconnect=False)
        supported_types = list(self.handlers.keys())
        _debug_log("F", "workers/media/worker.py:_get_next_job", "Polling for next media job", {"supported_types": supported_types})
        
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Lock and fetch next queued job
                cur.execute("""
                    UPDATE jobs
                    SET status = 'running', updated_at = NOW()
                    WHERE id = (
                        SELECT id FROM jobs
                        WHERE status = 'queued'
                          AND type = ANY(%s)
                        ORDER BY created_at ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                    )
                    RETURNING *
                """, (supported_types,))
                
                job = cur.fetchone()
                conn.commit()
                _debug_log("F", "workers/media/worker.py:_get_next_job", "Fetched job", {"found": bool(job), "job_type": job.get("type") if job else None, "job_id": job.get("id") if job else None})
                return dict(job) if job else None
        
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            logger.warning(f"Connection error while fetching job: {e}")
            # Reset connection and return None (will retry next poll)
            if self.conn:
                try:
                    self.conn.close()
                except:
                    pass
                self.conn = None
            return None

    def _complete_job(self, job_id: str, output: dict):
        """Mark job as succeeded."""
        def _do_complete(job_id, output):
            # Force fresh connection before updating job status (prevents timeout issues)
            logger.info("Refreshing database connection before marking job complete")
            conn = self._connect_db(force_reconnect=True)
            
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE jobs
                    SET status = 'succeeded', output = %s, updated_at = NOW()
                    WHERE id = %s
                """, (json.dumps(output), job_id))
                conn.commit()
        
        self._execute_with_retry(_do_complete, job_id, output)

    def _fail_job(self, job_id: str, error: str):
        """Mark job as failed."""
        def _do_fail(job_id, error):
            # Force fresh connection before updating job status (prevents timeout issues)
            logger.info("Refreshing database connection before marking job failed")
            conn = self._connect_db(force_reconnect=True)
            
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE jobs
                    SET status = 'failed', error = %s, updated_at = NOW()
                    WHERE id = %s
                """, (error, job_id))
                conn.commit()
        
        self._execute_with_retry(_do_fail, job_id, error)

    def _process_job(self, job: dict):
        """Process a single job."""
        job_id = job["id"]
        job_type = job["type"]
        job_input = job["input"]
        
        logger.info(f"Processing job {job_id} (type: {job_type})")
        
        handler = self.handlers.get(job_type)
        
        if not handler:
            _debug_log("H", "workers/media/worker.py:_process_job", "Unknown job type reached in media worker", {"job_id": job_id, "job_type": job_type})
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

