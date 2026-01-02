"""
Storage utilities for handling large file uploads to Supabase.
"""
import os
import time
import logging
from typing import Optional, Dict
import requests
import base64


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
        # NOTE: storage3 expects HTTP headers as file_options.
        # - content type key must be "content-type"
        # - upsert must be a STRING ("true"/"false"), not a bool (bool causes .encode errors in httpx)
        options: Dict[str, str] = {"upsert": "true"}
        if content_type:
            options["content-type"] = content_type
        
        def do_upload():
            response = supabase.storage.from_(bucket).upload(
                path,
                local_path,  # let storage3 stream from disk
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
            logger.info(f"  Uploaded {os.path.getsize(local_path)} bytes to {bucket}/{path}")
        
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
                options = {"upsert": "true"}
                if content_type:
                    options["content-type"] = content_type
                
                response = supabase.storage.from_(bucket).upload(
                    path,
                    local_path,
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


def _b64(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("ascii")


def _tus_metadata(bucket: str, path: str, content_type: Optional[str]) -> str:
    # Supabase expects these keys (same as tus-js-client usage in the frontend):
    # bucketName, objectName, contentType, cacheControl
    md = {
        "bucketName": _b64(bucket),
        "objectName": _b64(path),
        "contentType": _b64(content_type or "application/octet-stream"),
        "cacheControl": _b64("3600"),
    }
    return ",".join([f"{k} {v}" for k, v in md.items()])


def upload_resumable_tus(
    bucket: str,
    path: str,
    local_path: str,
    content_type: Optional[str] = None,
    logger: Optional[logging.Logger] = None,
    upsert: str = "true",
) -> bool:
    """
    Upload via Supabase Storage resumable endpoint (TUS).

    This avoids gateway body-size limits on /storage/v1/object (fixes 413s around ~50-150MB).
    """
    from config import Config

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise ValueError("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    file_size = get_file_size(local_path)
    chunk_size = int(Config.UPLOAD_CHUNK_SIZE_MB) * 1024 * 1024
    endpoint = f"{supabase_url}/storage/v1/upload/resumable"

    headers_base = {
        "authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "x-upsert": upsert,  # must be string
        "Tus-Resumable": "1.0.0",
    }

    # 1) Create upload
    create_headers = {
        **headers_base,
        "Upload-Length": str(file_size),
        "Upload-Metadata": _tus_metadata(bucket=bucket, path=path, content_type=content_type),
    }

    if logger:
        logger.info(f"  TUS upload create: {bucket}/{path} ({file_size / 1024 / 1024:.2f}MB)")
        logger.info(f"  Chunk size: {chunk_size / 1024 / 1024:.2f}MB, timeout: {Config.UPLOAD_TIMEOUT_SECONDS}s")

    create_resp = requests.post(endpoint, headers=create_headers, timeout=Config.UPLOAD_TIMEOUT_SECONDS)
    if create_resp.status_code not in (200, 201, 204):
        raise Exception(f"TUS create failed {create_resp.status_code}: {create_resp.text}")

    upload_url = create_resp.headers.get("Location")
    if not upload_url:
        raise Exception(f"TUS create missing Location header (status {create_resp.status_code})")
    if upload_url.startswith("/"):
        upload_url = f"{supabase_url}{upload_url}"

    # 2) Upload chunks
    offset = 0
    with open(local_path, "rb") as f:
        while offset < file_size:
            f.seek(offset)
            chunk = f.read(min(chunk_size, file_size - offset))

            def do_patch():
                patch_headers = {
                    **headers_base,
                    "Upload-Offset": str(offset),
                    "Content-Type": "application/offset+octet-stream",
                }
                resp = requests.patch(
                    upload_url,
                    headers=patch_headers,
                    data=chunk,
                    timeout=Config.UPLOAD_TIMEOUT_SECONDS,
                )
                if resp.status_code != 204:
                    raise Exception(f"TUS patch failed {resp.status_code}: {resp.text}")
                new_offset = resp.headers.get("Upload-Offset")
                if new_offset is None:
                    raise Exception("TUS patch missing Upload-Offset header")
                return int(new_offset)

            try:
                new_offset = upload_with_retry(
                    do_patch,
                    max_retries=Config.UPLOAD_MAX_RETRIES,
                    logger=logger,
                )
            except Exception as e:
                # Try to recover by HEAD to learn server offset
                head_headers = {**headers_base}
                head_resp = requests.head(upload_url, headers=head_headers, timeout=Config.UPLOAD_TIMEOUT_SECONDS)
                server_offset = head_resp.headers.get("Upload-Offset")
                if server_offset is not None:
                    offset = int(server_offset)
                    if logger:
                        logger.warning(f"  Recovered offset from server: {offset}")
                    continue
                raise e

            offset = new_offset
            if logger:
                pct = (offset / file_size) * 100
                if int(pct) % 10 == 0 or offset == file_size:
                    logger.info(f"  TUS progress: {pct:.0f}% ({offset}/{file_size})")

    if logger:
        logger.info(f"  TUS upload complete: {bucket}/{path}")
    return True


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

        # Choose upload method:
        # - Use TUS resumable upload for videos and/or larger files to avoid 413 gateway limits.
        is_video_bucket = bucket in ("project-raw-videos", "project-processed-videos")
        is_video_type = bool(content_type and content_type.startswith("video/"))
        use_tus = is_video_bucket or is_video_type or file_size_mb >= 50

        if use_tus:
            if logger:
                logger.info(f"  File size: {file_size_mb:.2f}MB (using TUS resumable upload)")
            return upload_resumable_tus(
                bucket=bucket,
                path=path,
                local_path=local_path,
                content_type=content_type,
                logger=logger,
                upsert="true",
            )

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

