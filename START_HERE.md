# 🚀 Quick Start - CFZ Workspace

## ✅ Status: Ready to Run!

All code changes have been copied to this workspace. You just need to:
1. Create environment files
2. Install dependencies
3. Start the 3 services

---

## Step 1: Create Environment Files (2 minutes)

### A. Web App Environment

```bash
cat > /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/apps/web/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
DATABASE_URL=YOUR_DATABASE_URL
OPENAI_API_KEY=YOUR_OPENAI_KEY
WORKER_SHARED_SECRET=any-random-secret
EOF
```

### B. Worker Environment

```bash
cat > /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/media/.env << 'EOF'
DATABASE_URL=YOUR_DATABASE_URL
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
OPENAI_API_KEY=YOUR_OPENAI_KEY
POLL_INTERVAL=5
TEMP_DIR=/tmp/media-worker
EOF
```

**Replace `YOUR_*` values** - See [ENV_SETUP.md](ENV_SETUP.md) for where to get credentials.

---

## Step 2: Install Dependencies (5 minutes)

### Web App
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/apps/web
npm install
```

### Media Worker
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/media
python3 -m pip install --upgrade pip
pip3 install -r requirements.txt
```

### Search Worker (optional)
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/search-processor
npm install
```

---

## Step 3: Run All Services (3 terminals)

### Terminal 1: Web App
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/apps/web
npm run dev
```
Opens at: **http://localhost:3000**

### Terminal 2: Media Worker
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/media
python3 worker.py
```

### Terminal 3: Search Worker (optional)
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/search-processor
npm start
```

---

## ✅ Verify It's Working

1. **Web app**: Open http://localhost:3000
2. **Health check**: http://localhost:3000/api/health should return `{"status":"ok"}`
3. **Worker**: Terminal 2 should show "Media Worker starting... Polling every 5 seconds..."

---

## 🎬 Test Video Processing

1. Go to: http://localhost:3000/projects/2f597dc3-1ee2-476e-ac8d-472e02e5b58b
2. Upload `/Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/test_video.mp4`
3. Watch Terminal 2 for processing logs
4. When complete, you'll see tabs for "Processed Video" and "Original Video"

---

## 📚 More Help

- **[ENV_SETUP.md](ENV_SETUP.md)** - Detailed environment setup guide
- **[QUICK_START.md](QUICK_START.md)** - Complete documentation
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Technical details
- **[README.md](README.md)** - Project overview

---

## 🐛 Troubleshooting

### "Your project's URL and Key are required"
→ Create `.env.local` file (see Step 1A above)

### "ImportError: attempted relative import"  
→ ✅ Fixed! All utils files are now in place

### "Cannot find module 'dotenv'"
→ Run: `cd workers/search-processor && npm install`

### "sh: next: command not found"
→ Run: `cd apps/web && npm install`

---

## What's Included in This Workspace

✅ **Silero VAD** - Neural silence removal (`workers/media/utils/vad_processor.py`)
✅ **Local Whisper** - Transcription (`workers/media/utils/transcription.py`)
✅ **LLM Retake Analysis** - GPT-4 cuts (`workers/media/utils/llm_cuts.py`)
✅ **Dual Video Display** - UI tabs for raw/processed videos
✅ **Updated Requirements** - Simplified dependencies
✅ **Setup Script** - `workers/media/setup.sh`

---

## Ready? Let's Go! 🚀

1. Fill in `.env` files (Step 1)
2. Install dependencies (Step 2)
3. Run 3 terminals (Step 3)
4. Open http://localhost:3000

Need help? Check [ENV_SETUP.md](ENV_SETUP.md) for detailed credential instructions.

