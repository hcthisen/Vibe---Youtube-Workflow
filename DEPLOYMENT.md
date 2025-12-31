# Deployment Guide for Coolify

This guide explains how to deploy the YouTube Production Assistant application on a VPS using Coolify.

## Prerequisites

- Coolify instance running on your VPS
- GitHub repository connected to Coolify
- Supabase instance (self-hosted or cloud)
- All required environment variables configured

## Quick Start

1. **Connect Repository**: In Coolify, connect your GitHub repository
2. **Select Docker Compose**: Choose "Docker Compose" as the deployment type
3. **Configure Environment Variables**: Add all required environment variables (see below)
4. **Deploy**: Coolify will automatically build and deploy both services

## Environment Variables

Create a `.env.production` file or configure these in Coolify's environment variables section:

### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Database
```
DATABASE_URL=postgresql://postgres:password@host:5432/postgres
```

### DataForSEO
```
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password
```

### OpenAI
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL_DEFAULT=gpt-5.2
OPENAI_MODEL_FAST=gpt-5-mini
```

### Google AI Studio (Nano Banana Pro)
```
GOOGLE_AI_STUDIO_API_KEY=your-google-ai-key
NANO_BANANA_MODEL=gemini-3-pro-image-preview
NANO_BANANA_ENDPOINT=https://generativelanguage.googleapis.com/v1beta
```

### Worker
```
WORKER_SHARED_SECRET=your-secret-key
WORKER_POLL_INTERVAL=5
WORKER_TEMP_DIR=/tmp/yt-worker
```

## Database Migrations

Before starting the application, run database migrations:

### Option 1: Using Docker Compose (Recommended)
```bash
docker-compose --profile migration up migrate
```

### Option 2: Manual Migration
```bash
# From the project root
cd apps/web
npm run db:migrate
```

### Option 3: Using Coolify's Run Command
In Coolify, use the "Run Command" feature to execute:
```bash
npm run db:migrate
```

## Storage Buckets

Ensure the following Supabase storage buckets exist:
- `user-headshots`
- `project-raw-videos`
- `project-processed-videos`
- `project-transcripts`
- `project-reports`
- `project-thumbnails`

You can create these manually in Supabase or run the bucket creation script.

## Services

The Docker Compose setup includes:

1. **web**: Next.js application (port 3000)
2. **worker**: Python media processing worker
3. **migrate**: Database migration service (runs on demand)

## Health Checks

- Web service: `http://localhost:3000/api/health`
- Worker service: Python process check

## Troubleshooting

### Build Failures

If the build fails:
1. Check that all environment variables are set
2. Verify Node.js version (requires 20+)
3. Ensure Python 3.10+ is available for the worker

### Worker Issues

If the worker fails to start:
1. Verify `DATABASE_URL` is correct
2. Check that `ffmpeg` is installed (included in Dockerfile)
3. Ensure temp directory permissions are correct

### Database Connection

If database connections fail:
1. Verify `DATABASE_URL` format
2. Check network connectivity from containers
3. Ensure database allows connections from Docker network

## Production Considerations

1. **Resource Limits**: Video processing is CPU/memory intensive. Allocate sufficient resources to the worker service.

2. **Storage**: The worker uses a volume for temporary video files. Ensure adequate disk space.

3. **Scaling**: You can scale the worker service horizontally by running multiple instances. The job queue uses `FOR UPDATE SKIP LOCKED` to prevent conflicts.

4. **Monitoring**: Set up monitoring for:
   - Application health endpoints
   - Worker job processing times
   - Database connection pool

5. **Backups**: Regularly backup your Supabase database and storage buckets.

## Updating the Application

1. Push changes to your GitHub repository
2. Coolify will automatically detect changes and rebuild
3. Or manually trigger a rebuild in Coolify's UI

## Local Testing

To test the Docker setup locally:

```bash
# Build and start services
docker-compose up --build

# Run migrations
docker-compose --profile migration up migrate

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

