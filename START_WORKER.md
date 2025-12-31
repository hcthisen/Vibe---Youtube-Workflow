# Starting the Media Worker

## Problem
The pose analysis jobs are being created but not processed because the Python media worker is not running.

## Solution: Start the Worker

### Option 1: Quick Start (Terminal)

```bash
cd /Users/hc/Documents/GitHub/Vibe---Youtube-Workflow/workers/media

# Install dependencies (if not already done)
pip3 install -r requirements.txt

# Copy environment variables
export NEXT_PUBLIC_SUPABASE_URL="https://supabasekong-og0w4c0soc048kkc0gkcs8ow.vizr.cc"
export SUPABASE_SERVICE_ROLE_KEY="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NzA5NDU2MCwiZXhwIjo0OTIyNzY4MTYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.cV2S_BDQtbkhEseOTMcQWbBT5oRkatdScxveiOwUmU4"
export DATABASE_URL="postgresql://postgres:UqgA1dTXT5eGt7ImPVwZRmrHSGWhiWnd@135.181.90.4:5432/postgres"

# Start the worker
python3 worker.py
```

### Option 2: Using Environment File

Create `workers/media/.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://supabasekong-og0w4c0soc048kkc0gkcs8ow.vizr.cc
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NzA5NDU2MCwiZXhwIjo0OTIyNzY4MTYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.cV2S_BDQtbkhEseOTMcQWbBT5oRkatdScxveiOwUmU4
DATABASE_URL=postgresql://postgres:UqgA1dTXT5eGt7ImPVwZRmrHSGWhiWnd@135.181.90.4:5432/postgres
WORKER_POLL_INTERVAL=5
WORKER_TEMP_DIR=/tmp/yt-worker
WHISPER_MODEL=base
```

Then run:

```bash
cd workers/media
python3 worker.py
```

### Option 3: Background Process

```bash
cd /Users/hc/Documents/GitHub/Vibe---Youtube-Workflow/workers/media
nohup python3 worker.py > worker.log 2>&1 &
```

## What the Worker Does

Once running, it will:
1. Poll the `jobs` table for queued jobs
2. Process `pose_analyze`, `video_process`, and `transcribe` jobs
3. Update headshots with `pose_yaw`, `pose_pitch`, and `pose_bucket`
4. Mark jobs as `succeeded` or `failed`

## Verify It's Working

After starting, you should see:
- Jobs changing from `queued` → `running` → `succeeded`
- Headshots getting populated with yaw/pitch values
- Worker logs showing job processing

## Check Queued Jobs

Run this to see pending jobs:

```bash
psql $DATABASE_URL -c "SELECT id, type, status, created_at FROM jobs WHERE status='queued' ORDER BY created_at DESC LIMIT 10;"
```

Or use the debug page: http://localhost:3001/debug?tab=jobs

