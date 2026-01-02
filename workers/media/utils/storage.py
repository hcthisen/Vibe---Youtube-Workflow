"""
Storage utilities for handling large file uploads to Supabase.
"""
import os
import time
import logging
from typing import Optional
import requests


def get_file_size(file_path: str) -> int:
    """Get file size in bytes."""
    return os.path.getsize(file_path)


def upload_with_retry(
    upload_func,
    max_retries: int = 3,
    base_delay: float = 1.0,
    logger: Optional[logging.Logger] = None
):
    """
    Retry wrapper with exponential backoff.
    
    Args:
        upload_func: Function to call for upload (should return True on success)
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds (will be doubled for each retry)
        logger: Logger instance for logging retry attempts
    
    Returns:
        Result of upload_func if successful
        
    Raises:
        Last exception if all retries fail
    """
    last_error = None
    
    for attempt in range(max_retries):
        try:
            return upload_func()
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                if logger:
                    logger.warning(f"  Upload attempt {attempt + 1} failed: {e}")
                    logger.info(f"  Retrying in {delay}s...")
                time.sleep(delay)
            else:
                if logger:
                    logger.error(f"  All {max_retries} upload attempts failed")
    
    raise last_error


def upload_small_file(
    supabase,
    bucket: str,
    path: str,
    local_path: str,
    content_type: Optional[str] = None,
    logger: Optional[logging.Logger] = None
) -> bool:
    """
    Upload small file (<100MB) using direct Supabase client method.
    
    Args:
        supabase: Supabase client instance
        bucket: Storage bucket name
        path: Remote path within bucket
        local_path: Local file path
        content_type: MIME type (optional)
        logger: Logger instance
    
    Returns:
        True if upload successful, False otherwise
    """
    try:
        # Read file content
        with open(local_path, "rb") as f:
            file_content = f.read()
        
        # Prepare options
        options = {"upsert": "true"}
        if content_type:
            options["content_type"] = content_type
        
        def do_upload():
            response = supabase.storage.from_(bucket).upload(
                path,
                file_content,
                file_options=options
            )
            return response
        
        # Upload with retry
        from config import Config
        upload_with_retry(
            do_upload,
            max_retries=Config.UPLOAD_MAX_RETRIES,
            logger=logger
        )
        
        if logger:
            logger.info(f"  Uploaded {len(file_content)} bytes to {bucket}/{path}")
        
        return True
        
    except Exception as e:
        # If upload fails due to existing file, try removing and retrying
        if logger:
            logger.warning(f"  Upload failed, attempting to remove existing file: {e}")
        
        try:
            supabase.storage.from_(bucket).remove([path])
            if logger:
                logger.info(f"  Removed existing file, retrying upload...")
            
            def do_retry():
                with open(local_path, "rb") as f:
                    file_content = f.read()
                
                options = {"upsert": "true"}
                if content_type:
                    options["content_type"] = content_type
                
                response = supabase.storage.from_(bucket).upload(
                    path,
                    file_content,
                    file_options=options
                )
                return response
            
            from config import Config
            upload_with_retry(
                do_retry,
                max_retries=Config.UPLOAD_MAX_RETRIES,
                logger=logger
            )
            
            if logger:
                logger.info(f"  Retry successful")
            
            return True
            
        except Exception as retry_error:
            if logger:
                logger.error(f"  Retry also failed: {retry_error}")
            return False


def upload_large_file(
    supabase,
    bucket: str,
    path: str,
    local_path: str,
    content_type: Optional[str] = None,
    logger: Optional[logging.Logger] = None
) -> bool:
    """
    Upload large file (>=100MB) using chunked streaming approach.
    
    This method streams the file in chunks to avoid loading the entire file into memory.
    Uses Supabase Storage REST API directly with proper timeout configuration.
    
    Args:
        supabase: Supabase client instance
        bucket: Storage bucket name
        path: Remote path within bucket
        local_path: Local file path
        content_type: MIME type (optional)
        logger: Logger instance
    
    Returns:
        True if upload successful, False otherwise
    """
    from config import Config
    
    try:
        file_size = get_file_size(local_path)
        file_size_mb = file_size / 1024 / 1024
        
        if logger:
            logger.info(f"  Large file upload: {file_size_mb:.2f}MB")
            logger.info(f"  Using chunked upload with {Config.UPLOAD_TIMEOUT_SECONDS}s timeout")
        
        # Get Supabase credentials
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            raise ValueError("Missing Supabase URL or service key")
        
        # Remove existing file first (upsert for large files can be problematic)
        try:
            supabase.storage.from_(bucket).remove([path])
            if logger:
                logger.info(f"  Removed existing file (if any)")
        except Exception:
            pass  # File might not exist, which is fine
        
        # Prepare upload URL and headers
        upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{path}"
        headers = {
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        }
        if content_type:
            headers["Content-Type"] = content_type
        
        # Define upload function with streaming
        def do_upload():
            with open(local_path, "rb") as f:
                # Use requests for better control over streaming and timeouts
                response = requests.post(
                    upload_url,
                    headers=headers,
                    data=f,
                    timeout=Config.UPLOAD_TIMEOUT_SECONDS
                )
                
                if response.status_code not in (200, 201):
                    error_detail = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
                    raise Exception(f"Upload failed with status {response.status_code}: {error_detail}")
                
                return True
        
        # Upload with retry and exponential backoff
        result = upload_with_retry(
            do_upload,
            max_retries=Config.UPLOAD_MAX_RETRIES,
            logger=logger
        )
        
        if logger:
            logger.info(f"  Successfully uploaded {file_size_mb:.2f}MB to {bucket}/{path}")
        
        return result
        
    except Exception as e:
        if logger:
            logger.error(f"  Large file upload failed: {type(e).__name__}: {e}")
        return False


def upload_file_smart(
    supabase,
    bucket: str,
    path: str,
    local_path: str,
    content_type: Optional[str] = None,
    logger: Optional[logging.Logger] = None
) -> bool:
    """
    Smart file upload that chooses the best method based on file size.
    
    - Files < 100MB: Direct upload using Supabase client
    - Files >= 100MB: Chunked streaming upload using REST API
    
    Args:
        supabase: Supabase client instance
        bucket: Storage bucket name
        path: Remote path within bucket
        local_path: Local file path
        content_type: MIME type (optional)
        logger: Logger instance
    
    Returns:
        True if upload successful, False otherwise
    """
    try:
        # Check if file exists
        if not os.path.exists(local_path):
            if logger:
                logger.error(f"  File not found: {local_path}")
            return False
        
        # Get file size
        file_size = get_file_size(local_path)
        file_size_mb = file_size / 1024 / 1024
        
        # Choose upload method based on size
        LARGE_FILE_THRESHOLD_MB = 100
        
        if file_size_mb < LARGE_FILE_THRESHOLD_MB:
            if logger:
                logger.info(f"  File size: {file_size_mb:.2f}MB (using direct upload)")
            return upload_small_file(
                supabase=supabase,
                bucket=bucket,
                path=path,
                local_path=local_path,
                content_type=content_type,
                logger=logger
            )
        else:
            if logger:
                logger.info(f"  File size: {file_size_mb:.2f}MB (using chunked upload)")
            return upload_large_file(
                supabase=supabase,
                bucket=bucket,
                path=path,
                local_path=local_path,
                content_type=content_type,
                logger=logger
            )
    
    except FileNotFoundError:
        if logger:
            logger.error(f"  File not found: {local_path}")
        return False
    except Exception as e:
        if logger:
            logger.error(f"  Upload failed: {type(e).__name__}: {e}")
            import traceback
            logger.error(f"  Traceback: {traceback.format_exc()}")
        return False

