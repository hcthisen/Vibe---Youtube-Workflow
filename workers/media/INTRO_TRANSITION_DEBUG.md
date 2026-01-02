# Intro Transition Debug Guide

## Problems Fixed

### Issue 1: Worker Getting Stuck During Rendering

The worker was getting stuck during Remotion rendering at the "✅ Frames copied" step with no further output.

### Issue 2: Database Connection Timeout

After long-running jobs (~4+ minutes), the database connection would time out when trying to update the job status, causing the job to fail even though processing completed successfully.

## Changes Made

### 1. Added Timeouts

**File**: `workers/media/utils/intro_transition.py`
- Added 2-minute timeout for transition generation using `signal.SIGALRM`
- Falls back to copying video if timeout occurs

**File**: `Initial Templates - execution/pan_3d_transition.py`
- Added 2-minute timeout to `subprocess.run` for Remotion rendering
- Added `--log info` flag to Remotion command for progress visibility

### 2. Added Verbose Logging

**File**: `Initial Templates - execution/pan_3d_transition.py`
- Added logging after frame copy ("✅ Frames copied")
- Added logging when writing React components
- Added detailed logging before Remotion render starts
- All prints use `flush=True` to ensure immediate output

### 3. Improved Remotion Check

**File**: `workers/media/utils/intro_transition.py`
- Added check for `@remotion/cli` in node_modules
- Added test run of `npx remotion versions` to verify Remotion works
- More detailed error messages

### 4. Fixed Database Connection Timeout

**File**: `workers/media/worker.py`
- Added `force_reconnect` parameter to `_connect_db()` method
- Added `_execute_with_retry()` method with automatic retry logic (up to 3 attempts)
- Modified `_complete_job()` and `_fail_job()` to:
  - Force a fresh database connection before updating job status
  - Automatically retry on `OperationalError` or `InterfaceError`
  - Log when refreshing connections

**Why this was needed:**
Long-running jobs (4+ minutes for intro transition rendering) would cause the PostgreSQL connection to time out. When the worker tried to update the job status to "succeeded", the connection would fail with `OperationalError: could not receive data from server: Operation timed out`.

Now the worker:
1. Forces a fresh connection before updating job status
2. Automatically retries up to 3 times if the connection fails
3. Logs connection refresh attempts for debugging

## What to Watch For

When you run the worker again with intro transitions, you should now see:

```
2026-01-02 XX:XX:XX,XXX [INFO] Adding intro transition overlay at 3.0s (duration: 5.0s)
2026-01-02 XX:XX:XX,XXX [INFO] This may take 30-60 seconds...
2026-01-02 XX:XX:XX,XXX [INFO] Generating 3D transition (teaser from 60.0s)
📹 Input: 1920x1080 @ 30.00fps
📸 Extracting 150 frames at 4.29fps (spaced across 35.0s)
📸 Extracting frames from 60.0s for 35.0s...
   Extracted 150 frames
🎬 Rendering 3D transition...
   Copying 150 frames to /path/to/video_effects/public/frames...
   ✅ Frames copied
   Writing React component...
   ✅ DynamicRoot.tsx written
   ✅ dynamic-index.ts written
   🎬 Starting Remotion render...
      Command: npx remotion render /path/to/dynamic-index.ts Pan3D /path/to/output.mp4
      Working directory: /path/to/video_effects
      (This may take 30-60 seconds...)

[Remotion output - bundling, rendering frames, encoding...]

✅ Rendered to /path/to/output.mp4
2026-01-02 XX:XX:XX,XXX [INFO] Overlaying transition on video at 3.0s
2026-01-02 XX:XX:XX,XXX [INFO] Using software encoding (libx264)
2026-01-02 XX:XX:XX,XXX [INFO] Transition overlay complete: /path/to/output.mp4
2026-01-02 XX:XX:XX,XXX [INFO] Step 5: Uploading assets
2026-01-02 XX:XX:XX,XXX [INFO] Video processing pipeline completed successfully
2026-01-02 XX:XX:XX,XXX [INFO] Refreshing database connection before marking job complete
2026-01-02 XX:XX:XX,XXX [INFO] Connected to database
2026-01-02 XX:XX:XX,XXX [INFO] Job xxx completed successfully
```

**Note**: The "Refreshing database connection" message is normal for long-running jobs and prevents timeout errors.

## If It Still Hangs

### Check 1: Where Does It Stop?

Look at the last log message. If it stops at:

- **"✅ Frames copied"** → Hanging when writing React files or starting Remotion
- **"🎬 Starting Remotion render..."** → Remotion command itself is hanging
- **No output after command** → Remotion is running but not outputting (check timeout)

### Check 2: Test Remotion Manually

```bash
cd "Initial Templates - execution/video_effects"

# Test basic render
npx remotion render src/index.ts Transition3DDemo test_output.mp4

# This should take ~10-20 seconds and create test_output.mp4
```

If this hangs, the problem is with Remotion itself, not our code.

### Check 3: System Resources

Remotion rendering is CPU/memory intensive:

```bash
# While rendering, check CPU/memory usage
top -pid $(pgrep -f remotion)
```

- Expected: 200-400% CPU (multi-core)
- Expected: 1-2 GB RAM
- If much higher: Might be swapping/thrashing

### Check 4: Disable Intro Transitions Temporarily

To test if the rest of the pipeline works, you can:

1. **Option A**: Don't enable intro transitions in the web UI
2. **Option B**: Modify `workers/media/handlers/video_process.py`:

```python
# Line 34
apply_intro_transition = input_data.get("apply_intro_transition", False)

# Change to:
apply_intro_transition = False  # Temporarily disabled for testing
```

This will skip transition rendering and process the video normally.

## Timeout Behavior

If rendering takes longer than 2 minutes, you'll see:

```
2026-01-02 XX:XX:XX,XXX [ERROR] Transition generation timed out: Transition generation timed out after 2 minutes
2026-01-02 XX:XX:XX,XXX [INFO] Falling back to copying video without transition
```

The video will still be processed (VAD, transcription, etc.) - just without the transition.

## Expected Rendering Time

For a typical video:
- **Frame extraction**: 5-10 seconds
- **Remotion bundling**: 10-20 seconds (first time, then cached)
- **Remotion rendering**: 20-40 seconds (depends on duration/resolution)
- **FFmpeg overlay**: 5-15 seconds (depends on video length)

**Total**: ~40-85 seconds for intro transition feature

## Quick Test Script

Run this to test Remotion in isolation:

```bash
python3 workers/media/test_remotion_quick.py
```

This tests just the Remotion rendering without the full pipeline.

## Still Stuck?

If it's still hanging after these changes:

1. **Check Remotion logs**: Look in `video_effects/.remotion/` for logs
2. **Try smaller video**: Test with a short (<30s) video first
3. **Check Node version**: `node --version` (need v18+)
4. **Reinstall Remotion**:
   ```bash
   cd "Initial Templates - execution/video_effects"
   rm -rf node_modules package-lock.json
   npm install
   ```

5. **Contact support** with:
   - Full worker logs
   - Output of `npx remotion versions`
   - Output of manual Remotion test
   - System specs (CPU, RAM, OS)

