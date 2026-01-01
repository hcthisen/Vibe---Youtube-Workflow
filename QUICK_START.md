# Quick Start Guide

## ✅ Installation Complete!

All Python dependencies have been successfully installed. Here's what you need to run:

## Running the Full Application

You need **3 terminals** running simultaneously:

### Terminal 1: Web Application

```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/aqf/apps/web
npm run dev
```

Opens at: **http://localhost:3000**

---

### Terminal 2: Media Worker (Video Processing) ⭐ NEW

```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/aqf/workers/media
python3 worker.py
```

This processes video uploads with:
- ✅ Silero VAD silence removal
- ✅ Local Whisper transcription
- ✅ LLM retake marker analysis
- ✅ Optional intro transitions

**Important**: Make sure FFmpeg is installed:
```bash
# Check if installed
which ffmpeg && which ffprobe

# If not found, install:
brew install ffmpeg
```

---

### Terminal 3: Search Worker (Optional)

```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/aqf/workers/search-processor
npm start
```

Only needed for outlier search and deep research features.

---

## Testing the Video Pipeline

### Test with Your Existing Video

1. **Start all 3 terminals** (see above)

2. **Open the test project**:
   - URL: http://localhost:3000/projects/2f597dc3-1ee2-476e-ac8d-472e02e5b58b

3. **Watch the worker logs** in Terminal 2:
   - You should see: `Media Worker starting...`
   - Then: `Polling interval: 5s`
   - When processing: Step-by-step progress

4. **Check the UI**:
   - Once processing completes, you'll see two tabs:
     - "Processed Video" (with silences removed)
     - "Original Video" (raw upload)
   - Download buttons for both
   - Edit report with statistics

### What to Expect

**Processing time for 10-minute video**: ~4-6 minutes
- VAD Silence Removal: 30-60 seconds
- Transcription: 2-3 minutes  
- LLM Analysis: 5-10 seconds (if retake markers found)
- Video Encoding: 1-2 minutes

### First Run Notes

On the **first video processing**, the worker will:
1. Download Silero VAD model (~1MB) - one time
2. Download Whisper base model (~150MB) - one time
3. Process the video

Subsequent videos will be faster (no downloads).

---

## Troubleshooting

### "No such file or directory: ffprobe"

```bash
brew install ffmpeg
```

### "ModuleNotFoundError: No module named 'torch'"

Dependencies not installed:
```bash
cd workers/media
pip3 install -r requirements.txt
```

### Worker Not Processing Jobs

1. Check DATABASE_URL is set in `.env`
2. Check Supabase credentials
3. Look at worker logs for errors

### Web App Won't Start

```bash
cd apps/web
npm install
npm run dev
```

---

## Environment Setup

Make sure you have a `.env` file in `workers/media/`:

```bash
# Database
DATABASE_URL=postgresql://...

# Supabase
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...

# OpenAI (for LLM retake analysis - optional)
OPENAI_API_KEY=sk-...

# Worker Settings
POLL_INTERVAL=5
TEMP_DIR=/tmp/media-worker
```

You can copy from `apps/web/.env.local` or create a new one.

---

## What's New

### Video Processing Pipeline

✅ **Silero VAD**: Neural voice activity detection (more accurate than old WebRTC VAD)

✅ **Local Whisper**: Word-level transcription with timestamps

✅ **LLM Retake Analysis**: GPT-4 analyzes "cut cut" phrases and generates intelligent cut instructions

✅ **Dual Video Display**: UI shows both original and processed videos

✅ **Comprehensive Reports**: Detailed edit reports with statistics

### Files Created

- `workers/media/utils/vad_processor.py`
- `workers/media/utils/transcription.py`
- `workers/media/utils/llm_cuts.py`
- `workers/media/utils/intro_transition.py`

### Files Updated

- `workers/media/requirements.txt` - Simplified dependencies
- `workers/media/handlers/video_process.py` - Complete rewrite
- `apps/web/src/components/projects/VideoPlayer.tsx` - Dual video display
- `apps/web/src/app/(dashboard)/projects/[id]/page.tsx` - Pass both assets

---

## Next Steps

1. **Start all terminals** (web app + media worker + search worker)

2. **Upload a test video** or check the existing project:
   - http://localhost:3000/projects/2f597dc3-1ee2-476e-ac8d-472e02e5b58b

3. **Monitor worker logs** to see processing in action

4. **Test retake markers** by creating a video with "cut cut" phrases

5. **Verify transcripts** are accurate and timestamps align

---

## Performance Tips

- Use hardware encoding when available (automatic on Apple Silicon)
- Process videos in parallel (run multiple workers)
- Use SSD for TEMP_DIR for faster I/O
- Pre-download Whisper models to avoid delays

---

## Need Help?

Check the detailed documentation:
- `IMPLEMENTATION_SUMMARY.md` - Full architecture and troubleshooting
- `Initial Templates - directives/` - Original script documentation
- Worker logs: `workers/media/worker.log`

Happy video processing! 🎬

