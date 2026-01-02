"""
Base handler class for worker jobs.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)


class BaseHandler(ABC):
    """Base class for job handlers."""

    def __init__(self, supabase, temp_dir: str):
        self.supabase = supabase
        self.temp_dir = temp_dir

    @abstractmethod
    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a job.
        
        Returns:
            Dict with 'success' (bool), 'output' (dict), and optionally 'error' (str)
        """
        pass

    def download_asset(self, bucket: str, path: str, local_path: str) -> bool:
        """Download an asset from Supabase storage."""
        try:
            with open(local_path, "wb") as f:
                response = self.supabase.storage.from_(bucket).download(path)
                f.write(response)
            return True
        except Exception as e:
            logger.error(f"Failed to download {bucket}/{path}: {e}")
            return False

    def upload_asset(self, bucket: str, path: str, local_path: str, content_type: str = None) -> bool:
        """Upload an asset to Supabase storage."""
        response = None
        try:
            # Read file first to avoid file handle issues
            with open(local_path, "rb") as f:
                file_content = f.read()
            
            # Prepare options
            options = {"upsert": "true"}  # Allow overwriting
            if content_type:
                options["content_type"] = content_type
            
            # Upload to storage
            try:
                response = self.supabase.storage.from_(bucket).upload(
                    path,
                    file_content,
                    file_options=options
                )
                logger.info(f"  Uploaded {len(file_content)} bytes to {bucket}/{path}")
            except Exception as upload_error:
                # If upload fails, try removing existing file first then re-upload
                logger.warning(f"  Upload failed, attempting to remove existing file: {upload_error}")
                try:
                    self.supabase.storage.from_(bucket).remove([path])
                    logger.info(f"  Removed existing file, retrying upload...")
                    response = self.supabase.storage.from_(bucket).upload(
                        path,
                        file_content,
                        file_options=options
                    )
                    logger.info(f"  Retry successful: {len(file_content)} bytes uploaded")
                except Exception as retry_error:
                    logger.error(f"  Retry also failed: {retry_error}")
                    raise retry_error
            
            return True
        except FileNotFoundError as e:
            logger.error(f"Failed to upload to {bucket}/{path}: File not found at {local_path}")
            return False
        except Exception as e:
            logger.error(f"Failed to upload to {bucket}/{path}: {type(e).__name__}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False

    def create_asset_record(self, user_id: str, project_id: str, asset_type: str,
                           bucket: str, path: str, metadata: dict = None) -> str:
        """Create a project_assets record."""
        try:
            result = self.supabase.table("project_assets").insert({
                "user_id": user_id,
                "project_id": project_id,
                "type": asset_type,
                "bucket": bucket,
                "path": path,
                "metadata": metadata or {},
            }).execute()
            
            return result.data[0]["id"] if result.data else None
        except Exception as e:
            logger.error(f"Failed to create asset record: {e}")
            return None

