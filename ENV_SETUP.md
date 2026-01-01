# Environment Variables Setup Guide

## Quick Setup

Run these commands to create your environment files:

### 1. Web App Environment

```bash
cat > /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/apps/web/.env.local << 'EOF'
# Supabase API Access
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database
DATABASE_URL=postgresql://postgres.your-project-id:your-password@host:6543/postgres

# OpenAI
OPENAI_API_KEY=sk-proj-your-key

# Optional: DataForSEO
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password

# Optional: Google AI Studio
GOOGLE_AI_STUDIO_API_KEY=your-google-key

# Worker
WORKER_SHARED_SECRET=your-secret
EOF
```

### 2. Media Worker Environment

```bash
cat > /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/media/.env << 'EOF'
# Database
DATABASE_URL=postgresql://postgres.your-project-id:your-password@host:6543/postgres

# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# OpenAI (for retake analysis)
OPENAI_API_KEY=sk-proj-your-key

# Worker Settings
POLL_INTERVAL=5
TEMP_DIR=/tmp/media-worker
EOF
```

---

## Where to Get Your Credentials

### Supabase Credentials

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

### Database URL

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **Database**
4. Copy **Connection string** → **Transaction pooler** (Port 6543)
5. Replace `[YOUR-PASSWORD]` with your database password

Example:
```
postgresql://postgres.abcdefghij:your-password@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

### OpenAI API Key

1. Go to: https://platform.openai.com/api-keys
2. Click **Create new secret key**
3. Copy the key → `OPENAI_API_KEY`

---

## After Creating .env Files

### Start All Services

**Terminal 1: Web App**
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/apps/web
npm install
npm run dev
```

**Terminal 2: Media Worker**
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/media
python3 worker.py
```

**Terminal 3: Search Worker (optional)**
```bash
cd /Users/hc/.cursor/worktrees/Vibe---Youtube-Workflow/cfz/workers/search-processor
npm install
npm start
```

---

## Verify Setup

Once all services are running:

1. **Check web app**: http://localhost:3000
2. **Check health endpoint**: http://localhost:3000/api/health
3. **Upload a test video** to verify the pipeline

---

## Troubleshooting

### "Your project's URL and Key are required"

→ `.env.local` file is missing or has wrong values
→ Check that all Supabase variables are set correctly

### "ImportError: attempted relative import beyond top-level package"

→ `utils/` folder is missing in workers/media
→ Make sure you're in the `cfz` workspace with all changes

### "Cannot find module 'dotenv'"

→ Dependencies not installed in search-processor
→ Run: `cd workers/search-processor && npm install`

---

## Quick Copy-Paste Template

Replace `YOUR_VALUES_HERE` with actual credentials:

```bash
# Web App .env.local
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL_HERE
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
DATABASE_URL=YOUR_DATABASE_URL_HERE
OPENAI_API_KEY=YOUR_OPENAI_KEY_HERE
WORKER_SHARED_SECRET=any-random-secret-123
EOF

# Worker .env
cat > workers/media/.env << 'EOF'
DATABASE_URL=YOUR_DATABASE_URL_HERE
SUPABASE_URL=YOUR_SUPABASE_URL_HERE
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
OPENAI_API_KEY=YOUR_OPENAI_KEY_HERE
POLL_INTERVAL=5
TEMP_DIR=/tmp/media-worker
EOF
```

---

## Example (with fake values)

```bash
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghij.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWoiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYyMDAwMDAwMCwiZXhwIjoxOTM1NTc2MDAwfQ.abc123...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWoiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjIwMDAwMDAwLCJleHAiOjE5MzU1NzYwMDB9.xyz789...
DATABASE_URL=postgresql://postgres.abcdefghij:MyPassword123@aws-0-us-west-1.pooler.supabase.com:6543/postgres
OPENAI_API_KEY=sk-proj-abc123def456ghi789...
WORKER_SHARED_SECRET=my-random-secret-key-456
```

