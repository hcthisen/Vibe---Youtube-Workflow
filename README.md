# YouTube Production Assistant

> **📘 For AI Agents**: Please read [AGENTS.md](AGENTS.md) first for comprehensive database access instructions, environment setup, and development workflows.

A web app that helps creators research YouTube video ideas, edit talking-head videos (silence removal), generate transcripts, and create AI-powered thumbnails.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase (Auth, Postgres, Storage)
- **Research**: DataForSEO YouTube SERP API
- **AI**: OpenAI (GPT-5.2) for text generation
- **Thumbnails**: Nano Banana Pro (Google AI Studio - Imagen)
- **Video Processing**: Python worker with ffmpeg + WebRTC VAD + Whisper

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.10+
- ffmpeg installed on system
- Supabase account (self-hosted or cloud)

### 1. Install Dependencies

```bash
# Install Node.js dependencies
cd apps/web
npm install

# Install Python dependencies (for worker)
cd ../../workers/media
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create `.env.local` in the root directory:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Direct PostgreSQL Connection (for migrations)
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# DataForSEO
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL_DEFAULT=gpt-5.2
OPENAI_MODEL_FAST=gpt-5-mini

# Google AI Studio (Nano Banana Pro)
GOOGLE_AI_STUDIO_API_KEY=your-google-ai-key
NANO_BANANA_MODEL=gemini-3-pro-image-preview
NANO_BANANA_ENDPOINT=https://generativelanguage.googleapis.com/v1beta

# Worker
WORKER_SHARED_SECRET=your-secret-key
```

### 3. Set Up Database

Run the database migration:

```bash
# From project root
npm run db:migrate
```

Or manually execute `supabase/migrations/001_initial_schema.sql` against your database.

### 4. Create Storage Buckets

Run the bucket creation script or create manually in Supabase:

- `user-headshots`
- `project-raw-videos`
- `project-processed-videos`
- `project-transcripts`
- `project-reports`
- `project-thumbnails`

### 5. Run the App

```bash
# Start the web app
cd apps/web
npm run dev

# In another terminal, start the Python worker
cd workers/media
python worker.py
```

Visit `http://localhost:3000` to access the app.

## Project Structure

```
/apps
  /web                    # Next.js web application
    /src
      /app                # App Router pages
      /components         # React components
      /lib                # Utilities, integrations, tools
/workers
  /media                  # Python video processing worker
    /handlers             # Job handlers
/packages
  /core                   # Shared TypeScript types
  /tools                  # Tool registry and schemas
  /integrations           # API clients
/supabase
  /migrations             # SQL migrations
```

## Features

### Research
- **Outlier Search**: Find viral videos in your niche using DataForSEO
- **Deep Research**: AI-generated video ideas based on your channel baseline

### Projects
- **Outline Generation**: AI-powered video outlines with sections and beats
- **Title Variants**: Multiple title options in different styles

### Video Processing
- **Silence Removal**: Automatically cuts pauses above your threshold
- **Transcription**: Full transcript with timestamps using Whisper
- **Edit Report**: Detailed breakdown of cuts made

### Thumbnails
- **Headshot Analysis**: Auto-categorizes face direction (yaw/pitch)
- **AI Generation**: Create thumbnails from reference images using Nano Banana Pro
- **Iteration**: Refine thumbnails with natural language prompts

## Tool Architecture

All major actions are implemented as tools with:
- Zod input/output schemas
- Persistent execution logs (`tool_runs` table)
- API endpoints at `/api/tools/[tool_name]`

### Available Tools

| Tool | Description |
|------|-------------|
| `channel_import_latest_20` | Import videos from a YouTube channel |
| `outlier_search` | Search for outlier videos with scoring |
| `deep_research` | Generate video ideas with AI |
| `project_create_from_idea` | Create project from saved idea |
| `project_generate_outline` | Generate video outline |
| `project_generate_titles` | Generate title variants |
| `video_upload_finalize` | Finalize upload and create job |
| `headshot_pose_analyze` | Analyze face direction |
| `thumbnail_generate_from_reference` | Generate thumbnails |
| `thumbnail_iterate` | Refine thumbnails |

## Background Jobs

The Python worker polls the `jobs` table and processes:
- `video_process`: Silence removal, transitions
- `transcribe`: Generate transcript with Whisper
- `pose_analyze`: Analyze headshot face direction

## License

Private - All rights reserved.

