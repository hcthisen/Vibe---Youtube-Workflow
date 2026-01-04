# 🚀 Quick Start Guide

## ✅ Status: Ready to Run!

All code changes have been copied to this workspace. You just need to:
1. Create environment files
2. Install dependencies
3. Start the 3 services

---

## Step 1: Create Environment Files (2 minutes)

### A. Web App Environment

```bash
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
DATABASE_URL=YOUR_DATABASE_URL
OPENAI_API_KEY=YOUR_OPENAI_KEY
WORKER_SHARED_SECRET=any-random-secret
EOF
```

### B. Media Worker Environment

```bash
cat > workers/media/.env << 'EOF'
DATABASE_URL=YOUR_DATABASE_URL
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
OPENAI_API_KEY=YOUR_OPENAI_KEY
POLL_INTERVAL=5
TEMP_DIR=/tmp/media-worker
EOF
```

### C. Search Worker Environment (Optional)

```bash
cat > workers/search-processor/.env << 'EOF'
DATABASE_URL=YOUR_DATABASE_URL
OPENAI_API_KEY=YOUR_OPENAI_KEY
WORKER_SHARED_SECRET=any-random-secret
EOF
```

**Replace `YOUR_*` values** - See [ENV_SETUP.md](ENV_SETUP.md) for where to get credentials.

---

## Step 2: Install Dependencies (5 minutes)

### Web App
```bash
cd apps/web
npm install
```

### Media Worker

**First, install FFmpeg** (required):
```bash
# Check if already installed
which ffmpeg && which ffprobe

# If not found, install:
brew install ffmpeg  # macOS
# or: apt install ffmpeg  # Linux
```

**Then install Python dependencies**:
```bash
cd workers/media
python3 -m pip install --upgrade pip
pip3 install -r requirements.txt
```

**First run note**: The worker will download models on first use:
- Silero VAD model (~1MB)
- Whisper base model (~150MB)

### Search Worker (Optional)
```bash
cd workers/search-processor
npm install
```

---

## Step 3: Run All Services (3 terminals)

### Terminal 1: Web App
```bash
cd apps/web
npm run dev
```
Opens at: **http://localhost:3000**

### Terminal 2: Media Worker ⭐
```bash
cd workers/media
python3 worker.py
```

This processes video uploads with:
- ✅ Silero VAD silence removal (neural voice detection)
- ✅ Local Whisper transcription with timestamps
- ✅ LLM retake marker analysis ("cut cut" phrases)
- ✅ Optional intro transitions

### Terminal 3: Search Worker (Optional)
```bash
cd workers/search-processor
npm start
```

Only needed for outlier search and deep research features.

---

## ✅ Verify It's Working

1. **Web app**: Open http://localhost:3000 - you should see the app
2. **Health check**: http://localhost:3000/api/health should return `{"status":"ok"}`
3. **Media worker**: Terminal 2 should show "Media Worker starting... Polling every 5 seconds..."
4. **Sign up/Login**: Create an account or log in to test

---

## 🎬 Test Video Processing

### Quick Test with Included Video

1. **Create a new project** or use an existing one
2. **Upload the test video**: `test_video.mp4` (from project root)
3. **Watch Terminal 2** for processing logs - you'll see:
   - Job picked up
   - VAD silence detection
   - Transcription progress
   - LLM analysis (if retake markers found)
   - Video encoding
4. **Wait for completion** (~4-6 minutes for a 10-minute video)
5. **View results**:
   - Two video tabs: "Processed Video" and "Original Video"
   - Download buttons for both
   - Transcript viewer with timestamps
   - Edit report with statistics (cuts, silence removed, etc.)

### Processing Timeline

**For a typical 10-minute talking-head video**:
- VAD Silence Detection: 30-60 seconds
- Transcription: 2-3 minutes
- LLM Analysis: 5-10 seconds (if "cut cut" markers detected)
- Video Encoding: 1-2 minutes
- **Total**: ~4-6 minutes

First run will be slower due to model downloads.

---

## 🐛 Troubleshooting

### "Your project's URL and Key are required"
→ Create `.env.local` file in `apps/web/` (see Step 1A)

### "No such file or directory: ffprobe"
→ Install FFmpeg: `brew install ffmpeg`

### "ModuleNotFoundError: No module named 'torch'"
→ Install Python dependencies:
```bash
cd workers/media
pip3 install -r requirements.txt
```

### "sh: next: command not found"
→ Install web app dependencies:
```bash
cd apps/web
npm install
```

### Worker Not Processing Jobs
1. Check `DATABASE_URL` is set in `workers/media/.env`
2. Verify Supabase credentials are correct
3. Look at worker logs for error messages
4. Check that all 3 terminals are running

### "ImportError: attempted relative import"
→ ✅ Already fixed! All utility files are in place

### Video Processing Fails
1. Check FFmpeg is installed: `which ffmpeg`
2. Check disk space (needs ~2-3x video size for temp files)
3. Review worker logs in Terminal 2 for specific errors
4. Verify OpenAI API key if using LLM features

---

## 📚 What's Included

### Core Features
✅ **Video Processing Pipeline**
- Silero VAD neural silence removal
- Local Whisper transcription with word-level timestamps
- LLM retake analysis for "cut cut" phrases
- Dual video display (original + processed)

✅ **Project Management**
- Create projects from ideas
- Upload and process videos
- Generate outlines and titles
- Manage thumbnails

✅ **Research Tools**
- Outlier video search
- Deep research workflows
- Channel baseline analysis

### Key Files Created
- `workers/media/utils/vad_processor.py` - Neural silence detection
- `workers/media/utils/transcription.py` - Whisper transcription
- `workers/media/utils/llm_cuts.py` - GPT-4.1 retake analysis
- `workers/media/utils/intro_transition.py` - Transition effects
- `apps/web/src/components/projects/VideoPlayer.tsx` - Dual video UI

---

## 📖 Additional Documentation

- **[ENV_SETUP.md](ENV_SETUP.md)** - Detailed environment setup guide
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Technical architecture details
- **[AGENTS.md](AGENTS.md)** - AI agent development guide
- **[README.md](README.md)** - Project overview
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide

---

## 🎯 Next Steps

1. ✅ **Start all 3 terminals** (web app + media worker + search worker)
2. ✅ **Sign up** for an account at http://localhost:3000
3. ✅ **Create a project** and upload a test video
4. ✅ **Watch the processing** happen in Terminal 2
5. ✅ **Test features**: Try retake markers by saying "cut cut" in a video
6. ✅ **Explore research tools**: Try outlier search for video ideas

---

## ⚡ Performance Tips

- **Hardware encoding**: Automatic on Apple Silicon for faster processing
- **Parallel processing**: Run multiple worker instances for concurrent jobs
- **SSD storage**: Use fast disk for `TEMP_DIR` to speed up I/O
- **Pre-download models**: Run a test video to cache Whisper models

---

## Ready? Let's Go! 🚀

1. Fill in `.env` files (Step 1)
2. Install dependencies (Step 2)
3. Run 3 terminals (Step 3)
4. Open http://localhost:3000 and start creating!

Need help? Check the documentation links above or review worker logs for troubleshooting.
