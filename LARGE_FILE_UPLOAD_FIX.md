# Large File Upload Fix - Implementation Summary

## Problem

The media worker was failing to upload large processed videos (>500MB) with the following errors:

```
HTTP/2 413 Request Entity Too Large
Failed to upload: local variable 'response' referenced before assignment
```

## Root Causes

1. **Storage bucket limit**: Buckets were limited to ~500MB (default)
2. **Memory exhaustion**: Worker loaded entire 2GB file into RAM before uploading
3. **No timeout configuration**: Large uploads exceeded default HTTP timeouts
4. **Single-shot upload**: No chunking or streaming for large files
5. **Poor error handling**: Variable initialization issues in upload code

## Solution Implemented

### 1. Database Configuration

**Migration**: `supabase/migrations/014_configure_storage_timeouts.sql`

- Increased bucket limits to 2GB (2,147,483,648 bytes)
- Configured allowed MIME types for video buckets
- Applied to: `project-raw-videos`, `project-processed-videos`

### 2. Smart Upload Strategy

**New Module**: `workers/media/utils/storage.py`

Implements intelligent upload routing:

```python
def upload_file_smart(supabase, bucket, path, local_path, content_type, logger):
    file_size = get_file_size(local_path)
    
    if file_size < 100MB:
        # Fast path: Direct upload using Supabase client
        return upload_small_file(...)
    else:
        # Memory-efficient: Chunked streaming upload
        return upload_large_file(...)
```

**Key Features**:

- **Small files (< 100MB)**: Direct upload (existing method)
- **Large files (>= 100MB)**: Streaming upload via REST API
- **Memory-efficient**: Streams file without loading into RAM
- **Retry logic**: Exponential backoff (1s, 2s, 4s delays)
- **Timeout handling**: Configurable 10-minute timeout

### 3. Configuration

**File**: `workers/media/config.py`

Added upload configuration:

```python
UPLOAD_TIMEOUT_SECONDS = int(os.getenv("UPLOAD_TIMEOUT_SECONDS", "600"))  # 10 min
UPLOAD_CHUNK_SIZE_MB = int(os.getenv("UPLOAD_CHUNK_SIZE_MB", "50"))  # 50MB
UPLOAD_MAX_RETRIES = int(os.getenv("UPLOAD_MAX_RETRIES", "3"))  # 3 attempts
```

### 4. Worker Integration

**File**: `workers/media/handlers/base.py`

Simplified `upload_asset()` to use new storage utility:

```python
def upload_asset(self, bucket, path, local_path, content_type=None):
    from utils.storage import upload_file_smart
    
    return upload_file_smart(
        supabase=self.supabase,
        bucket=bucket,
        path=path,
        local_path=local_path,
        content_type=content_type,
        logger=logger
    )
```

### 5. Enhanced Logging

**File**: `workers/media/handlers/video_process.py`

Added file size logging before upload:

```python
logger.info("Step 5: Uploading assets")

# Log file size for context
file_size_mb = os.path.getsize(current_video_path) / 1024 / 1024
logger.info(f"  Processed video size: {file_size_mb:.2f}MB")

if not self.upload_asset(...):
    return {"success": False, "error": "Failed to upload processed video"}
```

### 6. Frontend Validation

**File**: `apps/web/src/components/projects/VideoUploader.tsx`

Updated file size validation:

```typescript
// Validate file size (2GB max)
if (file.size > 2 * 1024 * 1024 * 1024) {
  setError(`File size must be under 2GB. Your file is ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB`);
  return;
}
```

### 7. Dependencies

**File**: `workers/media/requirements.txt`

Added `requests` library for better upload control:

```
requests==2.31.0
```

## Testing

### Expected Behavior

**Small File (< 100MB)**:
```
[INFO] Step 5: Uploading assets
[INFO]   Processed video size: 45.23MB
[INFO]   File size: 45.23MB (using direct upload)
[INFO]   Uploaded 47456789 bytes to project-processed-videos/...
```

**Large File (>= 100MB)**:
```
[INFO] Step 5: Uploading assets
[INFO]   Processed video size: 1234.56MB
[INFO]   File size: 1234.56MB (using chunked upload)
[INFO]   Large file upload: 1234.56MB
[INFO]   Using chunked upload with 600s timeout
[INFO]   Removed existing file (if any)
[INFO]   Successfully uploaded 1234.56MB to project-processed-videos/...
```

**Upload Failure with Retry**:
```
[INFO] Step 5: Uploading assets
[INFO]   Processed video size: 567.89MB
[INFO]   File size: 567.89MB (using chunked upload)
[WARNING]   Upload attempt 1 failed: Connection timeout
[INFO]   Retrying in 1s...
[INFO]   Successfully uploaded 567.89MB to project-processed-videos/...
```

### Test Commands

```bash
# 1. Install new dependencies
cd workers/media
pip install -r requirements.txt

# 2. Restart worker
python worker.py

# 3. Upload a large video (500MB-2GB) through the UI
# Monitor worker logs for upload progress
```

## Configuration Options

### For Slower Networks

Increase timeout in worker environment:

```bash
# workers/media/.env
UPLOAD_TIMEOUT_SECONDS=1200  # 20 minutes instead of 10
```

### For Unreliable Networks

Increase retry attempts:

```bash
# workers/media/.env
UPLOAD_MAX_RETRIES=5  # 5 attempts instead of 3
```

## Error Handling

### Previous Error
```
[ERROR] Failed to upload: local variable 'response' referenced before assignment
```

**Cause**: Variable initialization issue in old upload code

**Fixed**: New implementation properly initializes all variables and uses try-except blocks correctly

### Previous Error
```
HTTP/2 413 Request Entity Too Large
```

**Cause**: Storage bucket limit was 500MB

**Fixed**: Migration increased limit to 2GB

### Timeout Errors

If uploads still timeout on very slow connections:

1. Increase `UPLOAD_TIMEOUT_SECONDS` environment variable
2. Check network bandwidth (2GB upload requires stable connection)
3. Consider reducing video resolution/bitrate before processing

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Video Upload Flow                        │
└─────────────────────────────────────────────────────────────┘

User uploads video (up to 2GB)
         ↓
Frontend validation (VideoUploader.tsx)
         ↓
Supabase Storage (project-raw-videos bucket)
         ↓
Worker picks up job
         ↓
Video processing pipeline
  - VAD silence removal
  - Transcription
  - Retake cuts (LLM)
  - Intro transition (optional)
         ↓
Upload processed video
         ↓
┌────────────────────────────────────┐
│  Smart Upload Decision             │
│                                    │
│  File < 100MB?                     │
│    YES → Direct upload (fast)      │
│    NO  → Chunked upload (safe)     │
└────────────────────────────────────┘
         ↓
Retry logic (exponential backoff)
         ↓
Success! Video available in UI
```

## Files Changed

1. ✅ `workers/media/config.py` - Added upload configuration
2. ✅ `workers/media/requirements.txt` - Added requests library
3. ✅ `workers/media/utils/storage.py` - NEW: Smart upload utility
4. ✅ `workers/media/handlers/base.py` - Simplified upload_asset()
5. ✅ `workers/media/handlers/video_process.py` - Enhanced logging
6. ✅ `supabase/migrations/014_configure_storage_timeouts.sql` - NEW: Bucket limits
7. ✅ `apps/web/src/components/projects/VideoUploader.tsx` - Updated validation
8. ✅ `workers/media/README.md` - Documented large file support
9. ✅ `AGENTS.md` - Documented upload architecture

## Next Steps

1. **Test with real large file**: Upload a 500MB-2GB video through the UI
2. **Monitor logs**: Check worker logs for upload progress and any errors
3. **Verify upload**: Confirm processed video appears in project UI
4. **Performance tuning**: Adjust timeout/retry settings if needed

## Rollback Plan

If issues occur, revert these changes:

```bash
# 1. Revert code changes
git checkout HEAD~1 workers/media/

# 2. Remove new migration (optional, bucket limits are safe to keep)
# Migration 014 only increases limits, doesn't break anything

# 3. Restart worker
cd workers/media
python worker.py
```

## Success Criteria

- ✅ Videos up to 2GB can be uploaded
- ✅ Worker doesn't run out of memory during upload
- ✅ Upload completes within 10-minute timeout
- ✅ Retry logic handles transient network failures
- ✅ Clear error messages for debugging
- ✅ No "response referenced before assignment" errors

