"""
Media Worker - Polls for jobs and processes videos.
"""
import os
import sys
import time
import json
import signal
import logging
import random

from supabase import create_client

from config import Config
from handlers.video_process import VideoProcessHandler
from handlers.transcribe import TranscribeHandler
from handlers.pose_analyze import PoseAnalyzeHandler
from handlers.thumbnail_generate import ThumbnailGenerateHandler
from handlers.thumbnail_iterate import ThumbnailIterateHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

DEBUG_LOG_ENABLED = os.getenv("WORKER_DEBUG_LOG", "").lower() in ("1", "true", "yes")
_debug_dir = os.getenv("WORKER_TEMP_DIR") or os.getenv("TEMP_DIR") or "/tmp/yt-worker"
DEBUG_LOG_PATH = os.getenv("WORKER_DEBUG_LOG_PATH", os.path.join(_debug_dir, "worker.debug.log"))

def _debug_log(hypothesis_id: str, location: str, message: str, data: dict):
    """Write NDJSON debug log line (avoid secrets)."""
    if not DEBUG_LOG_ENABLED:
        return
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
        self.supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)
        
        # Ensure temp directory exists
        os.makedirs(Config.TEMP_DIR, exist_ok=True)
        
        # Register handlers
        self.handlers = {
            "video_process": VideoProcessHandler(self.supabase, Config.TEMP_DIR),
            "transcribe": TranscribeHandler(self.supabase, Config.TEMP_DIR),
            "pose_analyze": PoseAnalyzeHandler(self.supabase, Config.TEMP_DIR),
            "thumbnail_generate": ThumbnailGenerateHandler(self.supabase, Config.TEMP_DIR),
            "thumbnail_iterate": ThumbnailIterateHandler(self.supabase, Config.TEMP_DIR),
        }
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle graceful shutdown."""
        logger.info("Shutdown signal received, finishing current job...")
        self.running = False

    def _execute_with_retry(self, operation, *args, max_retries=3):
        """Execute a Supabase operation with automatic retry on transient errors."""
        for attempt in range(max_retries):
            try:
                return operation(*args)
            
            except Exception as e:
                logger.warning(f"Supabase error (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    # Last attempt failed, re-raise
                    raise
                
                time.sleep(1 * (2 ** attempt))  # Brief pause before retry

    def _get_next_job(self):
        """Get the next queued job."""
        supported_types = list(self.handlers.keys())
        _debug_log("F", "workers/media/worker.py:_get_next_job", "Polling for next media job", {"supported_types": supported_types})
        
        try:
            def _claim_job():
                result = self.supabase.rpc(
                    "claim_next_job",
                    {"supported_types": supported_types}
                ).execute()
                error = getattr(result, "error", None)
                if error:
                    raise RuntimeError(f"claim_next_job RPC failed: {error}")
                return result.data

            job = self._execute_with_retry(_claim_job)
            if isinstance(job, list):
                job = job[0] if job else None

            _debug_log(
                "F",
                "workers/media/worker.py:_get_next_job",
                "Fetched job",
                {"found": bool(job), "job_type": job.get("type") if job else None, "job_id": job.get("id") if job else None}
            )
            return dict(job) if job else None

        except Exception as e:
            logger.warning(f"Supabase error while fetching job: {e}")
            return None

    def _complete_job(self, job_id: str, output: dict):
        """Mark job as succeeded."""
        def _do_complete(job_id, output):
            result = self.supabase.rpc(
                "complete_job",
                {"job_id": job_id, "job_output": output},
            ).execute()
            error = getattr(result, "error", None)
            if error:
                raise RuntimeError(f"Failed to update job {job_id}: {error}")

        self._execute_with_retry(_do_complete, job_id, output)

    def _fail_job(self, job_id: str, error: str):
        """Mark job as failed."""
        def _do_fail(job_id, error):
            result = self.supabase.rpc(
                "fail_job",
                {"job_id": job_id, "job_error": error},
            ).execute()
            err = getattr(result, "error", None)
            if err:
                raise RuntimeError(f"Failed to update job {job_id}: {err}")

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
        base_interval = max(0.1, float(Config.POLL_INTERVAL))
        max_idle_sleep = float(os.getenv("WORKER_MAX_IDLE_SLEEP", "30"))
        idle_backoff_factor = float(os.getenv("WORKER_IDLE_BACKOFF_FACTOR", "2"))
        idle_jitter = float(os.getenv("WORKER_IDLE_JITTER", "0.5"))
        idle_multiplier = 1.0

        logger.info("Media Worker starting...")
        logger.info(f"Polling interval: {Config.POLL_INTERVAL}s")
        
        while self.running:
            try:
                job = self._get_next_job()
                
                if job:
                    idle_multiplier = 1.0
                    self._process_job(job)
                else:
                    sleep_for = min(max_idle_sleep, base_interval * idle_multiplier)
                    if idle_jitter > 0:
                        sleep_for += random.uniform(0, idle_jitter)
                    time.sleep(sleep_for)
                    if base_interval * idle_multiplier < max_idle_sleep:
                        idle_multiplier = min(
                            idle_multiplier * idle_backoff_factor,
                            max_idle_sleep / base_interval,
                        )
                    
            except Exception as e:
                logger.exception("Unexpected error in worker loop")
                sleep_for = min(max_idle_sleep, base_interval * idle_multiplier)
                if idle_jitter > 0:
                    sleep_for += random.uniform(0, idle_jitter)
                time.sleep(sleep_for)
                if base_interval * idle_multiplier < max_idle_sleep:
                    idle_multiplier = min(
                        idle_multiplier * idle_backoff_factor,
                        max_idle_sleep / base_interval,
                    )
        
        logger.info("Media Worker stopped")


if __name__ == "__main__":
    worker = MediaWorker()
    worker.run()

