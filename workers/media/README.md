# Media Worker - Video Processing Service

The media worker handles video processing tasks including:
- **VAD-based silence removal** using Silero VAD
- **Transcription** with OpenAI Whisper
- **Retake marker detection** and LLM-based cuts
- **3D intro transitions** using Remotion (optional)
- **Pose analysis** for headshot images

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Features](#features)
- [Intro Transitions](#intro-transitions)
- [Expected Warnings](#expected-warnings)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Basic Setup

```bash
cd workers/media

# Install Python dependencies
pip install -r requirements.txt

# Install system dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y ffmpeg postgresql-client
```

### Full Setup with Intro Transitions

If you want to use the 3D intro transition feature, you also need Node.js and Remotion:

```bash
# Install Node.js (required for Remotion)
# On Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or on macOS
brew install node

# Install Remotion dependencies
cd "Initial Templates - execution/video_effects"
npm install
cd -
```

---

## Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Database connection
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# Supabase (for storage and database queries)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (for transcription and LLM cuts)
OPENAI_API_KEY=sk-...

# Optional: Worker configuration
WORKER_CHECK_INTERVAL=5  # seconds between job checks

# Optional: Upload configuration (for large files)
UPLOAD_TIMEOUT_SECONDS=600  # 10 minutes (default)
UPLOAD_CHUNK_SIZE_MB=50     # 50MB chunks (default)
UPLOAD_MAX_RETRIES=3        # Max retry attempts (default)
```

### Large File Support

The worker supports video uploads up to **2GB** with automatic handling:

**Smart Upload Strategy**:
- Files < 100MB: Direct upload (fast path)
- Files >= 100MB: Chunked streaming upload (memory-efficient)

**Features**:
- Automatic retry with exponential backoff (1s, 2s, 4s delays)
- 10-minute upload timeout for large files
- Progress logging for monitoring
- Memory-efficient streaming (doesn't load entire file into RAM)

**Configuration**:
```bash
# Increase timeout for slower connections
UPLOAD_TIMEOUT_SECONDS=1200  # 20 minutes

# Adjust chunk size (not recommended to change)
UPLOAD_CHUNK_SIZE_MB=50

# Increase retries for unreliable networks
UPLOAD_MAX_RETRIES=5
```

### Running the Worker

```bash
# Start the worker
python worker.py

# Or with setup script
./setup.sh
```

---

## Features

### 1. VAD Silence Removal

Removes silence from videos using neural voice activity detection (Silero VAD):

- **Detection**: Identifies speech vs. silence using AI model
- **Preservation**: Keeps intro (first segment starts at 0:00)
- **Smart merging**: Combines close segments to avoid choppy cuts
- **Padding**: Adds configurable padding around speech segments

**Default parameters**:
- Min silence: 500ms
- Min speech: 250ms
- Padding: 100ms
- Merge gap: 300ms

### 2. Transcription

Generates word-level transcripts using OpenAI Whisper:

- **Model**: Base model (good accuracy/speed balance)
- **Output formats**: JSON (word timestamps) and plaintext
- **Word timestamps**: Precise start/end times for each word
- **No file size limits**: Processes videos of any length locally

### 3. Retake Marker Detection (LLM-Powered)

Detects retake phrases (e.g., "cut cut", "oops") and uses AI to intelligently remove mistakes with context-aware cut detection.

#### Overview

When recording videos, speakers often make mistakes and say a retake phrase to signal they want to redo that part. This feature:

1. **Searches** transcript for user-configured retake marker phrases
2. **Analyzes** surrounding context using GPT-4 to understand what went wrong
3. **Determines** optimal cut points (handles 2-second mistakes to 30+ second false starts)
4. **Applies** cuts via FFmpeg and updates the transcript

#### Key Features

**Flexible Cut Detection**
- Not limited to fixed duration (e.g., "always cut 10 seconds")
- Analyzes context to find where mistake actually begins
- Handles variable-length sessions: quick fixes, full redos, multiple attempts

**Pattern Recognition**
- `quick_fix`: Short 2-5 second mistakes, continues same thought
- `full_redo`: Long 10+ second segments, speaker restarts completely
- `multiple_attempts`: Multiple retake markers in quick succession
- `medium_segment`: 5-10 second mistakes

**Sentence Boundary Detection**
- Identifies natural break points using punctuation and pauses
- Prefers cutting at sentence boundaries for smoother flow
- Configurable via `retake_prefer_sentence_boundaries` setting

**Confidence Scoring**
- Each cut includes 0-1 confidence score from the LLM
- Low confidence cuts filtered out or trigger manual review
- All scores logged in edit report

**Robust Fallback**
- If LLM fails, uses enhanced heuristic fallback
- Fallback considers sentence boundaries, VAD segments, speech density
- Always provides reasonable results

#### Configuration Options

Users configure retake detection in their profile settings:

| Setting | Type | Default | Range | Description |
|---------|------|---------|-------|-------------|
| `retake_markers` | string[] | `[]` | - | Comma-separated phrases that trigger detection |
| `retake_context_window_seconds` | number | `30` | 10-120 | Context window size around markers for LLM |
| `retake_min_confidence` | number | `0.7` | 0.0-1.0 | Minimum confidence to accept LLM cuts |
| `retake_prefer_sentence_boundaries` | boolean | `true` | - | Prefer natural sentence boundaries |
| `llm_model` | string | `gpt-4` | gpt-4, gpt-4-turbo, gpt-4o | OpenAI model for analysis |

#### How It Works

**Step 1: Phrase Search**
```python
# Search transcript for retake markers
retake_matches = search_transcript_for_phrases(transcript_words, ["cut cut", "oops"])
# Returns: [{phrase: "cut cut", start: 52.8, end: 53.5, word_index: 234}, ...]
```

**Step 2: Context Extraction**
```python
# Extract 30s context window around each marker
context_words, start_idx, end_idx = extract_context_window(
    transcript_words, 
    marker_time=52.8,
    window_seconds=30
)
# Returns transcript words from 22.8s to 82.8s
```

**Step 3: Pattern Detection**
```python
# Classify retake type
pattern = detect_retake_pattern(context_words, match, transcript_words)
# Returns: "quick_fix", "full_redo", "multiple_attempts", etc.
```

**Step 4: LLM Analysis**
```python
# Send context to GPT-4 with reasoning prompt
cut_instructions = analyze_retake_cuts(
    transcript_words=transcript_words,
    retake_matches=retake_matches,
    api_key=openai_api_key,
    context_window_seconds=30,
    min_confidence=0.7,
    prefer_sentence_boundaries=True,
    model="gpt-4",
    vad_segments=speech_segments
)
```

**LLM Prompt Structure** (simplified):
```
You are analyzing a retake marker at 52.8s where the speaker said "cut cut".

Pattern: full_redo (10+ second segment, speaker restarts completely)

Transcript Context (30s window):
[22.8s - 23.2s] So
[23.2s - 23.5s] today
[23.5s - 23.9s] we're
... (full context)
[52.8s - 53.5s] cut cut
[53.5s - 53.9s] Alright
... (continuation)

Think step-by-step:
1. What was the speaker trying to say before "cut cut"?
2. Where does the mistake actually BEGIN?
3. What natural break point exists?

Return JSON: [{start_time, end_time, reason, confidence, reasoning}, ...]
```

**Step 5: Apply Cuts**
```python
# FFmpeg concatenates segments, removing cut ranges
apply_cuts_to_video(input_path, output_path, cut_instructions)
```

#### Example Scenarios

**Scenario 1: Quick Fix (2 seconds)**
```
Transcript:
[10.0s] "The key point here is, um, actually..."
[12.5s] "cut cut"  ← Retake marker
[13.0s] "The key point here is that you need to..."

LLM Decision:
- Cut 11.5s - 12.5s (removes "um, actually")
- Cut 12.5s - 13.0s (removes "cut cut")
- Confidence: 0.95
- Reasoning: "Quick verbal stumble, natural pause at 11.5s"
```

**Scenario 2: Full Redo (20 seconds)**
```
Transcript:
[30.0s] "So today we're going to talk about machine learning..."
[continues for 20 seconds with false start]
[50.0s] "cut cut"  ← Retake marker
[51.0s] "Welcome everyone! Today we're covering..."

LLM Decision:
- Cut 30.0s - 50.0s (removes entire false start)
- Cut 50.0s - 51.0s (removes "cut cut")
- Confidence: 0.89
- Reasoning: "Speaker completely restarted introduction, sentence boundary at 30.0s"
```

**Scenario 3: Multiple Attempts (3 tries)**
```
Transcript:
[40.0s] "The three main points are..."
[45.0s] "cut cut"
[46.0s] "So the three key concepts..."
[52.0s] "oops"
[53.0s] "Alright, the three essential..."

LLM Decision:
- Cut 40.0s - 45.0s + 45.0s - 46.0s (first attempt)
- Cut 46.0s - 52.0s + 52.0s - 53.0s (second attempt)
- Keep 53.0s onwards (successful take)
- Pattern: multiple_attempts
```

#### Edit Report

Each processed video includes detailed retake analysis in the edit report:

```json
{
  "retake_cuts_detailed": [
    {
      "start_time": 45.2,
      "end_time": 52.8,
      "duration_seconds": 7.6,
      "reason": "Removed false start before 'cut cut' at 52.8s",
      "confidence": 0.92,
      "pattern": "full_redo",
      "method": "llm",
      "llm_reasoning": "Speaker started explaining concept X but restarted completely. Natural sentence boundary at 45.2s where previous thought concluded."
    }
  ],
  "retake_analysis_settings": {
    "llm_model": "gpt-4",
    "context_window_seconds": 30,
    "min_confidence": 0.7,
    "prefer_sentence_boundaries": true
  }
}
```

#### Fallback Heuristics

If LLM analysis fails or confidence is too low, enhanced fallback heuristics activate:

**Strategy 1: Sentence Boundaries**
- Find nearest sentence-ending punctuation (. ! ?) before retake
- Look for pauses ≥ 0.5s between words
- Prefer boundaries within 2-30 seconds of marker

**Strategy 2: VAD Silence Gaps**
- Use VAD speech segments to find natural silence gaps
- Cut at the end of previous speech segment
- Ensures smooth transitions

**Strategy 3: Speech Density**
- Calculate words per second before retake
- Fast speech (3+ w/s): 8s lookback
- Medium speech (2-3 w/s): 12s lookback
- Slow speech (<2 w/s): 15s lookback

**Strategy 4: Default**
- If all else fails: 10 second lookback
- Always includes retake phrase itself

Fallback cuts are marked with:
- `method: "fallback_heuristic"`
- `confidence: 0.5` (mistake segment) or `0.9` (retake phrase)

#### Performance & Cost

- **LLM Analysis Time**: 2-5 seconds per retake marker
- **API Cost**: ~$0.01-0.03 per video (typical 2-3 retakes, GPT-4)
- **Fallback Time**: < 0.1 seconds (instant)
- **Recommended**: Use `gpt-4-turbo` for 50% cost savings

#### Troubleshooting

**Problem**: Cuts are too aggressive

**Solutions**:
- Increase `retake_min_confidence` to 0.8-0.9
- Enable `retake_prefer_sentence_boundaries`
- Review `llm_reasoning` in edit report
- Use `gpt-4o` for better context understanding

---

**Problem**: Cuts are too conservative

**Solutions**:
- Decrease `retake_min_confidence` to 0.5-0.6
- Increase `retake_context_window_seconds` to 45-60
- Check Whisper transcription accuracy
- Try different retake marker phrases

---

**Problem**: LLM analysis failing

**Solutions**:
- Verify `OPENAI_API_KEY` is set in environment
- Check OpenAI API usage limits
- Verify model availability (gpt-4, gpt-4-turbo, gpt-4o)
- Review worker logs: `tail -f worker.log`
- Fallback heuristics will still work

---

**Problem**: Cuts don't align with pauses

**Solutions**:
- Ensure `retake_prefer_sentence_boundaries` is enabled
- Increase `silence_threshold_ms` for better VAD
- Check VAD segments in edit report

#### Implementation Details

**File**: `workers/media/utils/llm_cuts.py`

**Key Functions**:
- `analyze_retake_cuts()` - Main entry point
- `extract_context_window()` - Get surrounding transcript
- `identify_sentence_boundaries()` - Find natural cut points
- `detect_retake_pattern()` - Classify retake type
- `merge_overlapping_cuts()` - Combine adjacent cuts
- `generate_fallback_cuts()` - Enhanced heuristic fallback
- `apply_cuts_to_video()` - FFmpeg cut application

**Dependencies**:
```python
from openai import OpenAI  # GPT-4 API
import json, re, time      # Parsing and retries
```

**See also**: `workers/media/docs/RETAKE_DETECTION.md` for comprehensive guide

### 4. 3D Intro Transitions (Optional)

Overlays a 3D swivel intro transition on the video:

- **Approach**: Overlays transition on top of video (preserves audio)
- **Content**: Shows fast-forward preview from later in video (default: 60s)
- **Effect**: 3D rotation with configurable parameters
- **Timing**: Default 3s start, 5s duration
- **Rendering**: Uses Remotion for high-quality effects

**See [Intro Transitions](#intro-transitions) section below for setup.**

### 5. Pose Analysis

Analyzes face pose (yaw/pitch) in headshot images using MediaPipe:

- **Face detection**: Detects faces in uploaded images
- **Pose estimation**: Calculates head rotation angles
- **Use case**: Matches headshots to thumbnail angles for face swapping

---

## Intro Transitions

### What is the Intro Transition?

The intro transition is a cinematic 3D effect that overlays on your video to create a "coming up" preview. It:

1. Takes content from later in your video (default: 60 seconds in)
2. Compresses it into a fast-forward preview (default: 7x speed)
3. Applies 3D rotation effects (swivel and tilt)
4. Overlays it on top of your video at a specific timestamp (default: 3 seconds)

**Result**: A 5-second preview of your content with 3D effects, while your original audio continues playing underneath.

### Prerequisites

The intro transition feature requires:

1. **Node.js** (v18 or later)
2. **Remotion dependencies** installed

**Installation**:

```bash
# Install Node.js
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS:
brew install node

# Verify installation
node --version  # Should show v18.x or later
npm --version

# Install Remotion dependencies
cd "Initial Templates - execution/video_effects"
npm install
```

### Testing the Transition

**Step 1: Test Remotion rendering**

```bash
cd "Initial Templates - execution"

# Generate a standalone 3D transition (1 second)
python3 pan_3d_transition.py ../test_video.mp4 output_transition.mp4

# Should create output_transition.mp4 with 3D effect
```

**Step 2: Test the overlay**

```bash
# Test manual overlay (assuming you have transition.mp4 from step 1)
ffmpeg -i ../test_video.mp4 -i output_transition.mp4 \
  -filter_complex "[0:v][1:v]overlay=enable='between(t,3,8)':x=0:y=0" \
  -c:a copy \
  test_with_overlay.mp4
```

**Step 3: Test through the worker**

Upload a video through the web app with "Apply intro transition" enabled. The worker will:
1. Process the video (VAD, transcription, etc.)
2. Generate the 3D transition using Remotion
3. Overlay it on the video at 3 seconds
4. Upload the final video with transition

### How it Works (Technical)

The implementation uses a **multilayer overlay approach**:

```
Original Video:  [════════════════════════════════════════]
Transition:               [▓▓▓▓▓]
Timeline:        [0s──3s──┤overlay├──8s────────────────end]
Audio:           [════════════════════════════════════════] (untouched)
```

**FFmpeg command**:
```bash
ffmpeg -i original.mp4 -i transition.mp4 \
  -filter_complex "[0:v][1:v]overlay=enable='between(t,3,8)':x=0:y=0" \
  -c:a copy \
  output.mp4
```

Where:
- `[0:v]` = original video stream
- `[1:v]` = transition video (generated by Remotion, no audio)
- `overlay=enable='between(t,3,8)'` = show transition from 3s to 8s
- `-c:a copy` = copy original audio without re-encoding

### Customization

To modify transition parameters, edit `workers/media/utils/intro_transition.py`:

```python
def add_intro_transition(
    input_path: str,
    output_path: str,
    insert_at: float = 3.0,        # When to show transition
    duration: float = 5.0,          # How long transition lasts
    teaser_start: float = 60.0,     # Where to preview content from
    bg_image_path: str = None       # Optional background image
)
```

Or modify the 3D effect in `Initial Templates - execution/pan_3d_transition.py`:

```python
DEFAULT_SWIVEL_START = 3.5    # Y-axis rotation start (degrees)
DEFAULT_SWIVEL_END = -3.5     # Y-axis rotation end (degrees)
DEFAULT_TILT_START = 1.7      # X-axis rotation (degrees)
DEFAULT_PLAYBACK_RATE = 7     # 700% speed (7x)
```

### Graceful Fallback

If Remotion is not installed or fails, the worker will:
1. Log a warning with details
2. Copy the video without the transition
3. Continue processing (transcription, etc.)
4. Mark `transition_applied: false` in the report

**No fatal errors** - videos are still processed even without transitions.

---

## Expected Warnings

### FP16 Warning (CPU Servers)

**You may see this warning during transcription:**

```
⚠️  FP16 is not supported on CPU; using FP32 instead
```

**This is NORMAL on CPU-only servers.**

- Whisper automatically falls back to FP32 (32-bit floating point)
- FP32 works perfectly fine - just slightly slower than FP16 on GPU
- **No action needed** - this is expected behavior

**Why it happens**:
- FP16 (16-bit floating point) is only supported on CUDA GPUs
- CPU-only servers (most VPS/cloud instances) use FP32
- The warning is informational, not an error

**If you want to suppress the warning**, Whisper already handles it gracefully. The worker logs it but continues processing normally.

### Remotion Not Available

If you see:

```
⚠️  Remotion not available: Node.js not found
⚠️  Falling back to copying video without transition
```

**This means:**
- Node.js is not installed, OR
- Remotion dependencies haven't been installed (`npm install`)
- The video will still be processed (VAD, transcription, etc.)
- Just without the 3D intro transition

**To fix**: See [Intro Transitions](#intro-transitions) setup above.

---

## Troubleshooting

### Import Errors (Python modules)

**Problem**: `ModuleNotFoundError: No module named 'whisper'`

**Solution**:
```bash
cd workers/media
pip install -r requirements.txt
```

### FFmpeg Not Found

**Problem**: `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'`

**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg
```

### Database Connection Errors

**Problem**: `psycopg2.OperationalError: could not connect to server`

**Solution**:
1. Check `DATABASE_URL` in your `.env` file
2. Verify the database is running and accessible
3. Test connection:
```bash
psql "$DATABASE_URL" -c "SELECT 1"
```

### Supabase Storage Errors

**Problem**: `403 Forbidden` when uploading to storage

**Solution**:
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set (not anon key)
2. Check storage bucket policies in Supabase dashboard
3. Ensure buckets exist (run `supabase/create-storage-buckets.ts`)

### Remotion Rendering Fails

**Problem**: `RuntimeError: Remotion render failed`

**Possible causes**:
1. **Node.js not installed**: Install Node.js v18+
2. **Dependencies missing**: Run `npm install` in `video_effects/`
3. **Video too short**: Transition tries to preview from 60s but video is shorter
   - Adjust `teaser_start` parameter or use shorter videos for testing
4. **Out of memory**: Remotion rendering can be memory-intensive
   - Reduce video resolution or use a machine with more RAM

**Debug**:
```bash
cd "Initial Templates - execution/video_effects"

# Check if dependencies are installed
ls node_modules/@remotion

# Test Remotion directly
npx remotion preview src/index.ts
```

### Worker Not Processing Jobs

**Problem**: Worker runs but doesn't pick up jobs

**Checklist**:
1. Check database connection (see above)
2. Verify jobs exist in the `jobs` table:
   ```sql
   SELECT id, job_type, status, created_at FROM jobs 
   ORDER BY created_at DESC LIMIT 10;
   ```
3. Check job status - worker only picks up `pending` jobs
4. Look for errors in worker logs

### Performance Issues

**Slow transcription**:
- Expected on CPU: Base model takes ~1-2x real-time (2 min video = 2-4 min processing)
- Use smaller model: `model_name="tiny"` in transcription config (less accurate)
- Use GPU if available: Install CUDA + cuDNN for 10-20x speedup

**Slow video encoding**:
- Worker auto-detects hardware encoders (VideoToolbox on Mac, others on Linux)
- Check logs for "Using hardware encoding" vs "Using software encoding"
- Software encoding (libx264) is slower but more compatible

---

## Architecture

### Job Flow

```
1. User uploads video → creates raw_video asset
2. API creates video_process job
3. Worker polls database for pending jobs
4. Worker processes video:
   ├─ VAD silence removal
   ├─ Transcription (Whisper)
   ├─ Retake detection (optional)
   ├─ Intro transition (optional)
   └─ Upload all assets
5. Worker updates job status to completed
6. Frontend polls job status and displays results
```

### File Structure

```
workers/media/
├── worker.py              # Main worker loop
├── config.py              # Configuration
├── requirements.txt       # Python dependencies
├── setup.sh              # Setup script
├── handlers/
│   ├── base.py           # Base handler class
│   ├── video_process.py  # Main video processing pipeline
│   ├── transcribe.py     # Transcription-only handler
│   └── pose_analyze.py   # Headshot pose analysis
└── utils/
    ├── vad_processor.py    # Silero VAD silence removal
    ├── transcription.py    # Whisper transcription
    ├── llm_cuts.py         # LLM-based retake cuts
    └── intro_transition.py # 3D intro transition (Remotion)
```

### Dependencies

**Python packages** (see `requirements.txt`):
- `openai-whisper` - transcription
- `torch` - Silero VAD model
- `psycopg2` - database
- `supabase` - storage & API
- `mediapipe` - pose analysis

**System dependencies**:
- `ffmpeg` - video/audio processing
- `postgresql-client` - database access

**Optional (for intro transitions)**:
- `node` - JavaScript runtime
- `npm` - package manager
- Remotion packages (in `video_effects/node_modules/`)

---

## Development

### Running Locally

```bash
cd workers/media

# Set environment variables
export DATABASE_URL="postgresql://..."
export SUPABASE_URL="https://..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export OPENAI_API_KEY="sk-..."

# Run worker
python worker.py
```

### Testing Individual Handlers

```python
from handlers.video_process import VideoProcessHandler
from config import Config

config = Config()
handler = VideoProcessHandler(config)

result = handler.process(
    job_id="test-123",
    input_data={
        "asset_id": "your-asset-id",
        "silence_threshold_ms": 500,
        "retake_markers": ["cut cut"],
        "apply_intro_transition": True
    }
)

print(result)
```

### Adding New Job Types

1. Create handler in `handlers/your_handler.py`:
```python
from .base import BaseHandler

class YourHandler(BaseHandler):
    def process(self, job_id: str, input_data: dict) -> dict:
        # Your logic here
        return {"success": True, "output": {...}}
```

2. Register in `worker.py`:
```python
from handlers.your_handler import YourHandler

HANDLERS = {
    "video_process": VideoProcessHandler,
    "your_job_type": YourHandler,
    # ...
}
```

3. Create jobs with `job_type = "your_job_type"`

---

## Support

For issues related to:
- **Video processing**: Check FFmpeg installation and logs
- **Database**: Verify `DATABASE_URL` and migrations
- **Storage**: Check Supabase credentials and bucket policies
- **Intro transitions**: See [Intro Transitions](#intro-transitions) section
- **Performance**: See performance tips in [Troubleshooting](#troubleshooting)

See `AGENTS.md` in the project root for more details on the overall architecture.

