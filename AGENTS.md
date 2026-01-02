# AGENTS.md - AI Agent Development Guide

**👋 Welcome, AI Agent!** This file contains essential information for working with this YouTube Production Assistant codebase. Please read this file first before making changes to understand the database setup, environment configuration, and development workflows.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [Database Access Methods](#database-access-methods)
4. [Running Migrations](#running-migrations)
5. [Common Database Operations](#common-database-operations)
6. [Database Schema Overview](#database-schema-overview)
7. [Storage Buckets](#storage-buckets)
8. [Testing Database Connection](#testing-database-connection)
9. [Troubleshooting](#troubleshooting)
10. [Initial Templates - Standalone Scripts & Workflows](#initial-templates---standalone-scripts--workflows)

---

## Quick Start

This project uses **Supabase** for:
- PostgreSQL database
- Authentication (via `auth.users` table)
- File storage (S3-compatible buckets)

All necessary credentials are in `.env.local` files (gitignored). The codebase uses three different patterns to access Supabase depending on the context.

---

## Environment Variables

### Location
- **Next.js app**: `/apps/web/.env.local`
- **Python worker**: `/workers/media/.env` (or reads from root `.env.local`)
- **Root scripts**: `/.env.local`

### Required Variables

```bash
# Supabase API Access
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # Public-safe key with RLS
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Admin key (bypasses RLS)

# Direct PostgreSQL Connection
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# Optional (other services)
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password
OPENAI_API_KEY=sk-...
GOOGLE_AI_STUDIO_API_KEY=your-key
WORKER_SHARED_SECRET=your-secret
```

### Key Differences

| Variable | Purpose | Access Level | Used In |
|----------|---------|--------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint | Public | Client & Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | User-scoped queries (RLS enforced) | Public | Client & Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin queries (bypasses RLS) | **Secret** | Server-only |
| `DATABASE_URL` | Direct PostgreSQL connection | **Secret** | Migrations, workers |

---

## Database Access Methods

This project uses **three different patterns** to access the database depending on context.

### 1. Client-Side Supabase (Browser)

**File**: `apps/web/src/lib/supabase/client.ts`

```typescript
import { createClient } from "@/lib/supabase/client";

// Usage in React components
const supabase = createClient();

const { data: projects } = await supabase
  .from("projects")
  .select("*")
  .eq("user_id", userId);
```

**When to use**: Client-side React components, browser-based queries  
**RLS**: ✅ Enforced (users can only access their own data)

---

### 2. Server-Side Supabase (Next.js Server Components/API Routes)

**File**: `apps/web/src/lib/supabase/server.ts`

```typescript
import { createClient } from "@/lib/supabase/server";

// Usage in Server Components or API routes
export default async function ProjectsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: projects } = await supabase
    .from("projects")
    .select("*, ideas(*)")
    .eq("user_id", user.id);
    
  return <div>...</div>;
}
```

**When to use**: Next.js Server Components, API routes  
**RLS**: ✅ Enforced (respects authenticated user from cookies)

---

### 3. Service Role Supabase (Admin Access)

**File**: `apps/web/src/lib/supabase/service.ts`

```typescript
import { createServiceClient } from "@/lib/supabase/service";

// Usage in background jobs, admin operations
const supabase = await createServiceClient();

const { data: allJobs } = await supabase
  .from("jobs")
  .select("*")
  .eq("status", "pending");
  
// Can access ANY user's data (no RLS)
```

**When to use**: Background workers, admin operations, system tasks  
**RLS**: ❌ Bypassed (full database access)

---

### 4. Direct SQL via PostgreSQL Client (TypeScript)

**File**: `supabase/run-migrations.ts` (example)

```typescript
import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // or { rejectUnauthorized: false } for cloud
});

await client.connect();

// Raw SQL queries
const result = await client.query(
  "SELECT * FROM profiles WHERE id = $1",
  [userId]
);

await client.end();
```

**When to use**: Migrations, complex queries, bulk operations  
**RLS**: ❌ Bypassed (direct database access)

---

### 5. Direct SQL via PostgreSQL Client (Python)

**File**: `workers/media/worker.py` (example)

```python
import psycopg2
from psycopg2.extras import RealDictCursor

# Connection
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cursor = conn.cursor(cursor_factory=RealDictCursor)

# Query
cursor.execute(
    "SELECT * FROM jobs WHERE status = %s ORDER BY created_at ASC LIMIT 1",
    ("pending",)
)
job = cursor.fetchone()

# Update
cursor.execute(
    "UPDATE jobs SET status = %s WHERE id = %s",
    ("processing", job["id"])
)
conn.commit()

cursor.close()
conn.close()
```

**When to use**: Python workers, long-running processes  
**RLS**: ❌ Bypassed (direct database access)

---

## Running Migrations

### Method 1: Using the Migration Script (Recommended)

```bash
# From project root
npm run db:migrate

# Or from apps/web
cd apps/web
npm run db:migrate
```

This runs `supabase/run-migrations.ts` which:
1. Connects to the database using `DATABASE_URL`
2. Reads all `.sql` files in `supabase/migrations/`
3. Executes them in alphabetical order
4. Reports success/failure for each

---

### Method 2: Manual SQL Execution

```bash
# Using psql CLI
psql "$DATABASE_URL" -f supabase/migrations/001_initial_schema.sql

# Or connect interactively
psql "$DATABASE_URL"
postgres=# \i supabase/migrations/001_initial_schema.sql
postgres=# \q
```

---

### Creating a New Migration

**Naming convention**: `XXX_description.sql` (e.g., `009_add_comments_table.sql`)

```bash
# Create the file
touch supabase/migrations/009_add_comments_table.sql
```

**Migration template**:

```sql
-- Add Comments Feature
-- This migration adds a comments table for video projects

CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view comments on their projects"
    ON public.comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = comments.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert comments on their projects"
    ON public.comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = comments.project_id
            AND projects.user_id = auth.uid()
        )
        AND auth.uid() = user_id
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comments_project ON public.comments(project_id, created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_comments_updated_at 
    BEFORE UPDATE ON public.comments 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();
```

**Run the migration**:

```bash
npm run db:migrate
```

---

## Common Database Operations

### Querying Data (TypeScript)

```typescript
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();

// Simple select
const { data, error } = await supabase
  .from("projects")
  .select("*");

// With filters
const { data } = await supabase
  .from("projects")
  .select("*")
  .eq("status", "outline")
  .order("created_at", { ascending: false })
  .limit(10);

// With joins (foreign key relations)
const { data } = await supabase
  .from("projects")
  .select(`
    *,
    ideas(*),
    project_assets(*)
  `)
  .eq("user_id", userId);

// Single record
const { data, error } = await supabase
  .from("projects")
  .select("*")
  .eq("id", projectId)
  .single();
```

---

### Inserting Data (TypeScript)

```typescript
const { data, error } = await supabase
  .from("ideas")
  .insert({
    user_id: userId,
    source_video_id: "abc123",
    score: 85,
    status: "saved",
  })
  .select()
  .single();

// Multiple rows
const { data, error } = await supabase
  .from("ideas")
  .insert([
    { user_id: userId, score: 90 },
    { user_id: userId, score: 75 },
  ])
  .select();
```

---

### Updating Data (TypeScript)

```typescript
const { data, error } = await supabase
  .from("projects")
  .update({ status: "done" })
  .eq("id", projectId)
  .select()
  .single();

// Update multiple
const { error } = await supabase
  .from("jobs")
  .update({ status: "cancelled" })
  .eq("status", "pending")
  .lt("created_at", oldDate);
```

---

### Deleting Data (TypeScript)

```typescript
const { error } = await supabase
  .from("ideas")
  .delete()
  .eq("id", ideaId);
```

---

### Storage Operations (TypeScript)

```typescript
// Upload file
const { data, error } = await supabase.storage
  .from("project-thumbnails")
  .upload(`${userId}/${filename}`, file, {
    contentType: "image/png",
    upsert: true,
  });

// Get public URL
const { data } = supabase.storage
  .from("project-thumbnails")
  .getPublicUrl(path);

// Download file
const { data, error } = await supabase.storage
  .from("project-transcripts")
  .download(path);

// Delete file
const { error } = await supabase.storage
  .from("user-headshots")
  .remove([path]);

// List files
const { data, error } = await supabase.storage
  .from("project-raw-videos")
  .list(userId, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });
```

---

### Authentication (TypeScript)

```typescript
// Get current user (server-side)
const supabase = await createClient();
const { data: { user }, error } = await supabase.auth.getUser();

if (!user) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Use user.id for queries
const { data } = await supabase
  .from("projects")
  .select("*")
  .eq("user_id", user.id);
```

---

### LLM-Based Retake Detection

The video processing pipeline includes intelligent retake marker detection powered by OpenAI GPT-4. When users say phrases like "cut cut" during recording, the system uses AI to analyze the transcript and determine optimal cut points.

#### How It Works

1. **User Configuration**: Users set retake marker phrases in Settings (`/dashboard/settings`)
2. **Video Upload**: Raw video is uploaded to a project
3. **Processing Pipeline**:
   - VAD-based silence removal (Silero VAD)
   - Whisper transcription with word-level timestamps
   - Retake marker detection in transcript
   - **LLM Analysis**: GPT-4 analyzes context around markers to determine cuts
   - FFmpeg applies cuts and concatenates remaining segments
4. **Edit Report**: Detailed report includes LLM reasoning and confidence scores

#### Architecture Flow

```
Video Upload → VAD Silence Removal → Whisper Transcription
     ↓
Retake Marker Search (e.g., "cut cut")
     ↓
Extract Context Window (default: 30s before/after marker)
     ↓
LLM Analysis (GPT-4)
  - Identifies mistake start point
  - Determines natural cut boundaries
  - Returns cut timestamps + confidence scores
     ↓
FFmpeg Cut & Concatenate → Processed Video + Edit Report
```

#### Configuration Options

Users can configure retake detection in their profile settings:

```typescript
// Profile settings (profiles table)
{
  retake_markers: string[],                    // Default: []
  retake_context_window_seconds: number,       // Default: 30, Range: 10-120
  retake_min_confidence: number,               // Default: 0.7, Range: 0.0-1.0
  retake_prefer_sentence_boundaries: boolean,  // Default: true
  llm_model: "gpt-4" | "gpt-4-turbo" | "gpt-4o" // Default: "gpt-4"
}
```

#### Key Features

**1. Flexible Cut Length Detection**
- Handles 2-second mistakes to 30+ second false starts
- Analyzes context to find actual mistake start point
- Not limited to fixed lookback duration

**2. Pattern Recognition**
- `quick_fix`: Short 2-5 second mistakes
- `full_redo`: Long 10+ second segments
- `multiple_attempts`: Multiple retakes in succession

**3. Sentence Boundary Detection**
- Identifies natural break points based on punctuation and pauses
- Prefers cutting at sentence boundaries for smoother flow
- Configurable via `retake_prefer_sentence_boundaries`

**4. Confidence Scoring**
- Each cut includes 0-1 confidence score
- Low confidence triggers fallback heuristics
- Logged in edit reports for manual review

**5. Robust Fallback**
- Enhanced fallback uses sentence boundaries and VAD segments
- Adapts lookback based on speech density
- Always provides reasonable results even if LLM fails

#### Example Usage (Job Input)

```typescript
// When creating a video processing job
const { data: job } = await supabase
  .from("jobs")
  .insert({
    user_id: userId,
    type: "video_process",
    status: "queued",
    input: {
      asset_id: "...",
      silence_threshold_ms: 500,
      retake_markers: ["cut cut", "oops"],
      retake_context_window_seconds: 30,
      retake_min_confidence: 0.7,
      retake_prefer_sentence_boundaries: true,
      llm_model: "gpt-4",
      apply_intro_transition: false
    }
  });
```

#### Edit Report Structure

The processed video includes a detailed edit report:

```json
{
  "original_duration_ms": 180000,
  "after_silence_removal_ms": 150000,
  "after_retake_cuts_ms": 140000,
  "final_duration_ms": 140000,
  "silence_removed_ms": 30000,
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
    },
    {
      "start_time": 52.8,
      "end_time": 53.5,
      "duration_seconds": 0.7,
      "reason": "Retake phrase 'cut cut'",
      "confidence": 0.95,
      "pattern": "retake_phrase",
      "method": "llm"
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

#### Worker Implementation

**Location**: `workers/media/utils/llm_cuts.py`

Key functions:
- `analyze_retake_cuts()` - Main LLM analysis function
- `extract_context_window()` - Get transcript context around markers
- `identify_sentence_boundaries()` - Find natural cut points
- `detect_retake_pattern()` - Classify retake type
- `generate_fallback_cuts()` - Enhanced heuristic fallback

**Required Environment Variables**:
```bash
OPENAI_API_KEY=sk-...  # Required for LLM retake analysis
```

#### Error Handling

1. **LLM API Failures**: 
   - Automatic retry with exponential backoff (max 3 attempts)
   - Falls back to enhanced heuristics
   - Logs failure reason and fallback method

2. **Low Confidence Cuts**:
   - Cuts below `retake_min_confidence` are filtered out
   - Logged for manual review
   - Fallback heuristic used instead

3. **No Context Available**:
   - Skips LLM analysis for that marker
   - Uses fallback heuristic based on VAD segments

#### Troubleshooting

**Issue**: LLM cuts are too aggressive (cutting too much)

**Solution**: 
- Increase `retake_min_confidence` to 0.8 or 0.9
- Enable `retake_prefer_sentence_boundaries`
- Review edit report's `llm_reasoning` to understand decisions

---

**Issue**: LLM cuts are too conservative (not cutting enough)

**Solution**:
- Decrease `retake_min_confidence` to 0.5 or 0.6
- Increase `retake_context_window_seconds` to 45 or 60
- Check transcript quality (Whisper accuracy)

---

**Issue**: LLM analysis failing consistently

**Solution**:
- Verify `OPENAI_API_KEY` is set in worker environment
- Check OpenAI API usage limits
- Verify selected `llm_model` is available
- Review worker logs for specific error messages
- Fallback heuristics will still work

---

**Issue**: Cuts don't align with natural pauses

**Solution**:
- Enable `retake_prefer_sentence_boundaries` (should be default)
- Increase `silence_threshold_ms` for better VAD segment detection
- Use `gpt-4o` model for better context understanding

#### Performance Notes

- **LLM Analysis**: ~2-5 seconds per retake marker (depends on context window size)
- **Cost**: ~$0.01-0.03 per video (typical 2-3 retakes with GPT-4)
- **Fallback**: < 0.1 seconds (instant heuristic)
- **Recommended**: Use `gpt-4-turbo` for 50% cost reduction with similar quality

#### Related Documentation

- **Full Implementation Guide**: `workers/media/docs/RETAKE_DETECTION.md`
- **Worker README**: `workers/media/README.md` (section: Retake Marker Detection)
- **PRD Section**: `PRD.md` (section 6.8: Video processing pipeline)

---

## Database Schema Overview

### Core Tables

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `profiles` | User settings and preferences | `id` (UUID, FK to auth.users), `display_name`, `silence_threshold_ms` |
| `channels` | YouTube channel baseline data | `id`, `user_id`, `channel_identifier`, `baseline_summary` |
| `channel_transcripts` | Imported video transcripts | `id`, `channel_id`, `video_id`, `title`, `transcript` |
| `ideas` | Saved video ideas | `id`, `user_id`, `source_video_id`, `score`, `status` |
| `search_results` | Search history (outlier/deep research) | `id`, `user_id`, `search_type`, `results` |
| `projects` | Video production projects | `id`, `user_id`, `idea_id`, `title`, `status`, `outline` |
| `project_assets` | Video/transcript/thumbnail files | `id`, `project_id`, `asset_type`, `bucket`, `path` |
| `headshots` | User headshot images with pose data | `id`, `user_id`, `bucket`, `path`, `pose_yaw`, `pose_pitch` |
| `jobs` | Background processing jobs | `id`, `user_id`, `job_type`, `status`, `input`, `output` |
| `tool_runs` | Tool execution logs | `id`, `user_id`, `tool_name`, `status`, `input`, `output`, `logs` |

### Relationships

```
auth.users (Supabase Auth)
    ↓
profiles (1:1)
    ↓
channels (1:many)
    ↓
channel_transcripts (1:many)

auth.users
    ↓
ideas (1:many)
    ↓
projects (1:many)
    ↓
project_assets (1:many)

auth.users
    ↓
jobs (1:many)
tool_runs (1:many)
headshots (1:many)
```

### TypeScript Types

All database types are auto-generated in:
- **File**: `apps/web/src/lib/database.types.ts`

```typescript
import type { Database } from "@/lib/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];
```

---

## Storage Buckets

### Available Buckets

| Bucket Name | Public? | Purpose | Max Size |
|-------------|---------|---------|----------|
| `user-headshots` | ❌ Private | User profile headshot images | 50 MB |
| `project-raw-videos` | ❌ Private | Original uploaded videos | 500 MB |
| `project-processed-videos` | ❌ Private | Edited videos (silence removed) | 500 MB |
| `project-transcripts` | ❌ Private | Video transcripts (text/JSON) | 50 MB |
| `project-reports` | ❌ Private | Edit reports and metadata | 50 MB |
| `project-thumbnails` | ✅ Public | Generated thumbnail images | 50 MB |

### Creating Buckets

```bash
# Run the bucket creation script
npx tsx supabase/create-storage-buckets.ts
```

Or manually in Supabase Dashboard:
1. Go to Storage → Buckets
2. Create bucket with appropriate privacy setting
3. Configure RLS policies in `supabase/migrations/`

---

## Testing Database Connection

### Quick Connection Test (TypeScript)

```typescript
import { createServiceClient } from "@/lib/supabase/service";

async function testConnection() {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("count")
      .limit(1);
    
    if (error) throw error;
    
    console.log("✅ Database connection successful");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}
```

### Quick Connection Test (Python)

```python
import os
import psycopg2

def test_connection():
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        print("✅ Database connection successful")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
```

### Quick Connection Test (CLI)

```bash
# Using psql
psql "$DATABASE_URL" -c "SELECT current_database(), current_user;"

# Using curl (Supabase REST API)
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

---

## Troubleshooting

### Issue: "permission denied for table X"

**Cause**: Row Level Security (RLS) is blocking the query

**Solution**:
1. Check if you're using the correct client (service role bypasses RLS)
2. Verify RLS policies in migration files
3. Ensure `auth.uid()` matches the `user_id` in the query

```sql
-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'projects';
```

---

### Issue: "DATABASE_URL is not defined"

**Cause**: Environment variable not loaded

**Solution**:
1. Verify `.env.local` exists in the correct directory
2. Check file is not named `.env.local.example`
3. Restart your terminal/server after adding env vars
4. For scripts, explicitly load dotenv:

```typescript
import { config } from "dotenv";
config({ path: ".env.local" });
```

---

### Issue: "relation 'public.X' does not exist"

**Cause**: Migrations haven't been run

**Solution**:

```bash
# Run all migrations
npm run db:migrate

# Check which tables exist
psql "$DATABASE_URL" -c "\dt"
```

---

### Issue: "SSL connection required"

**Cause**: Supabase cloud requires SSL

**Solution**:

```typescript
// TypeScript (pg)
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Python (psycopg2)
conn = psycopg2.connect(
    os.getenv("DATABASE_URL"),
    sslmode="require"
)
```

---

### Issue: Migration fails with duplicate key/constraint error

**Cause**: Migration already partially applied

**Solution**:
1. Use `IF NOT EXISTS` in CREATE statements
2. Use `IF EXISTS` in DROP statements
3. Check migration status:

```sql
-- See all tables
\dt

-- See all constraints
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.projects'::regclass;
```

---

### Issue: Cannot insert into RLS-protected table

**Cause**: Missing INSERT policy or auth context

**Solution**:

```sql
-- Check INSERT policies
SELECT * FROM pg_policies 
WHERE tablename = 'ideas' AND cmd = 'INSERT';

-- Add INSERT policy if missing
CREATE POLICY "Users can insert own ideas"
    ON public.ideas FOR INSERT
    WITH CHECK (auth.uid() = user_id);
```

---

### Issue: Storage upload fails with 403

**Cause**: Missing storage policy or wrong bucket

**Solution**:

```sql
-- Check storage policies
SELECT * FROM storage.policies WHERE bucket_id = 'user-headshots';

-- Example policy (from migration 003)
CREATE POLICY "Users can upload own headshots"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'user-headshots' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
```

---

## Initial Templates - Standalone Scripts & Workflows

The project includes two "Initial Templates" folders containing **standalone Python scripts** for video production workflows. These operate **outside the main Next.js application** and are used for local content creation tasks.

### Folder Structure

```
Initial Templates - directives/    # Documentation (how to use each tool)
├── cross_niche_outliers.md       # Research viral videos across niches
├── jump_cut_vad.md               # Silence removal using neural VAD
├── pan_3d_transition.md          # 3D pan transitions for b-roll
├── recreate_thumbnails.md        # AI thumbnail generation/face swapping
└── smart_video_edit.md           # End-to-end video editing workflow

Initial Templates - execution/     # Python scripts (implementation)
├── analyze_face_directions.py    # Analyze face pose in photos
├── insert_3d_transition.py       # Add 3D transitions to videos
├── jump_cut_editor.py            # Legacy silence removal (FFmpeg-based)
├── jump_cut_vad.py              # Modern silence removal (Silero VAD)
├── jump_cut_vad_parallel.py     # Parallel processing version
├── jump_cut_vad_singlepass.py   # Single-pass version
├── pan_3d_transition.py         # Generate 3D pan effects
├── recreate_thumbnails.py       # Thumbnail generation with Nano Banana
├── scrape_cross_niche_outliers.py  # YouTube outlier research (yt-dlp)
├── scrape_cross_niche_tubelab.py   # YouTube outlier research (TubeLab API)
├── simple_video_edit.py         # Complete editing workflow
└── video_effects/               # Remotion-based video effects (Node.js)
```

### How to Use

**Step 1**: Read the directive (documentation) file

```bash
# View documentation for a tool
cat "Initial Templates - directives/jump_cut_vad.md"
cat "Initial Templates - directives/recreate_thumbnails.md"
```

**Step 2**: Run the corresponding execution script

```bash
# Example: Silence removal with neural VAD
python3 "Initial Templates - execution/jump_cut_vad.py" input.mp4 output.mp4

# Example: Generate thumbnails from YouTube video
python3 "Initial Templates - execution/recreate_thumbnails.py" \
  --youtube "https://youtube.com/watch?v=VIDEO_ID"

# Example: Research cross-niche outliers
python3 "Initial Templates - execution/scrape_cross_niche_tubelab.py" \
  --terms "business strategy"
```

### Available Tools

| Tool | Directive | Execution Script | Purpose |
|------|-----------|------------------|---------|
| **Jump Cut VAD** | `jump_cut_vad.md` | `jump_cut_vad.py` | Remove silences using neural voice detection (Silero VAD) |
| **Thumbnail Recreation** | `recreate_thumbnails.md` | `recreate_thumbnails.py` | AI-powered thumbnail generation with face swapping (Nano Banana Pro) |
| **Cross-Niche Outliers** | `cross_niche_outliers.md` | `scrape_cross_niche_tubelab.py` | Research viral videos across business niches |
| **3D Transitions** | `pan_3d_transition.md` | `pan_3d_transition.py` | Add cinematic 3D pan transitions |
| **Face Analysis** | N/A | `analyze_face_directions.py` | Analyze face pose (yaw/pitch) for thumbnail references |

### Common Workflows

#### 1. Video Editing with Silence Removal

```bash
# Basic silence removal
python3 "Initial Templates - execution/jump_cut_vad.py" \
  raw_recording.mp4 \
  edited.mp4

# With audio enhancement and restart detection
python3 "Initial Templates - execution/jump_cut_vad.py" \
  raw_recording.mp4 \
  edited.mp4 \
  --enhance-audio \
  --detect-restarts \
  --min-silence 0.5 \
  --padding 150
```

**Features**:
- Neural voice activity detection (Silero VAD)
- "Cut cut" restart phrase to remove mistakes
- Audio enhancement (EQ, compression, loudness normalization)
- LUT-based color grading
- Hardware encoding on Apple Silicon

**See**: `jump_cut_vad.md` for full CLI options

---

#### 2. Thumbnail Generation

```bash
# Generate 3 variations from YouTube video
python3 "Initial Templates - execution/recreate_thumbnails.py" \
  --youtube "https://youtube.com/watch?v=VIDEO_ID"

# Generate from local thumbnail
python3 "Initial Templates - execution/recreate_thumbnails.py" \
  --source "thumbnail.jpg" \
  -n 5

# Edit pass on generated thumbnail
python3 "Initial Templates - execution/recreate_thumbnails.py" \
  --edit "recreated_v3.png" \
  --prompt "Change colors to teal. Change text to 'AGENTIC FLOWS'."
```

**Workflow**:
1. **Setup**: Build reference photo bank with face direction analysis
2. **Generate**: AI face-swaps source thumbnail with best-matching reference
3. **Refine**: Iterative edit passes for text, colors, backgrounds

**See**: `recreate_thumbnails.md` for reference photo setup

---

#### 3. Cross-Niche Research

```bash
# Find viral videos in adjacent niches (uses TubeLab API)
python3 "Initial Templates - execution/scrape_cross_niche_tubelab.py" \
  --terms "business strategy" \
  --queries 3

# Skip transcripts for faster results
python3 "Initial Templates - execution/scrape_cross_niche_tubelab.py" \
  --skip_transcripts
```

**Output**: Outlier videos with:
- Pre-calculated outlier scores
- Video metadata (title, views, channel)
- Transcripts (optional)
- AI-generated title variants adapted to your niche

**See**: `cross_niche_outliers.md` for keyword strategy

---

### Dependencies

These scripts have **separate dependencies** from the main app:

```bash
# Video editing (jump_cut_vad.py)
brew install ffmpeg
pip install torch  # For Silero VAD
pip install whisper  # For restart detection

# Thumbnail generation (recreate_thumbnails.py)
pip install opencv-python mediapipe pillow google-generativeai

# Research scripts (scrape_cross_niche_*.py)
pip install yt-dlp anthropic gspread google-auth
```

Check individual directive files for complete dependency lists.

---

### Relationship to Main App

| Initial Templates Scripts | Main Next.js App |
|---------------------------|------------------|
| Standalone Python scripts | Full-stack web application |
| Local content creation | Project management, storage, auth |
| Direct file I/O | Supabase database/storage |
| Run from terminal | Browser-based UI |
| No database required | RLS-protected data access |

**When to use scripts**:
- Local video editing (silence removal, transitions)
- Thumbnail generation experiments
- Research/scraping tasks
- Batch processing files

**When to use main app**:
- Project management
- Collaborative workflows
- User authentication
- File storage/retrieval
- Tool execution tracking (`tool_runs` table)

---

### Configuration

Scripts use environment variables from `.env` files:

```bash
# For Nano Banana Pro (thumbnail generation)
NANO_BANANA_API_KEY=your-key

# For research scripts
TUBELAB_API_KEY=your-key
ANTHROPIC_API_KEY=sk-...
APIFY_API_TOKEN=your-token

# For transcripts
OPENAI_API_KEY=sk-...
```

Some scripts also require OAuth credentials:
- `credentials.json` - Google OAuth credentials
- `token.json` - Generated OAuth token

---

### Tips for AI Agents

1. **Read directives first** - Each `.md` file contains comprehensive documentation, CLI options, examples, and troubleshooting
2. **Check dependencies** - Scripts have different requirements than the main app
3. **Output locations** - Scripts typically output to `.tmp/` directory (gitignored)
4. **Standalone execution** - These scripts don't connect to Supabase or the main database
5. **Reference implementations** - Good examples of working with video, AI APIs, and file processing

**Common mistake**: Don't try to import these scripts into the Next.js app. They're meant to run independently.

---

## Additional Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase JS Client**: https://supabase.com/docs/reference/javascript/select
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security

---

## Summary for AI Agents

**Key Takeaways**:

1. ✅ Use **server-side Supabase client** for most operations in Next.js
2. ✅ Use **service role client** for admin/background tasks
3. ✅ Use **direct SQL** for migrations and complex queries
4. ✅ Always check RLS policies when queries fail
5. ✅ Run `npm run db:migrate` after creating new migrations
6. ✅ Use `DATABASE_URL` for direct PostgreSQL access
7. ✅ Check `database.types.ts` for TypeScript types
8. ✅ Use **Initial Templates scripts** for local video editing, thumbnails, and research

**Common Workflows**:

| Task | Method |
|------|--------|
| Add new table | Create migration SQL → Run `npm run db:migrate` |
| Query user data | Use server-side Supabase client with RLS |
| Background job | Use service role client (bypasses RLS) |
| Debug query | Use direct SQL with `psql` |
| Upload file | Use Supabase storage API |
| Check schema | Read migration files or use `\d tablename` in psql |
| Edit video locally | Use `Initial Templates - execution/jump_cut_vad.py` |
| Generate thumbnails | Use `Initial Templates - execution/recreate_thumbnails.py` |
| Research outliers | Use `Initial Templates - execution/scrape_cross_niche_tubelab.py` |

---

**Questions?** Check the migration files in `supabase/migrations/` for schema details, or search the codebase for usage examples.

