# Vibe YouTube Workflow — API Reference

All endpoints are under `/api/v1/` and require an API key via the `Authorization` header:

```
Authorization: Bearer vibe_xxxxxxxxxxxx...
```

All responses follow the format: `{ success: boolean, data?: T, error?: string }`

---

## Authentication

### Generate an API key

First time setup — use the webapp session auth (cookie) OR an existing API key:

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "claude-code"}'
```

Response includes the raw key **once** — store it securely:
```json
{ "success": true, "data": { "key": "vibe_abc123...", "prefix": "vibe_abc123", "name": "claude-code" } }
```

### Verify API key

```
GET /api/v1/auth
```

Returns user info: `{ user_id, display_name, default_language_code, llm_model }`

### List API keys

```
GET /api/v1/keys
```

### Revoke an API key

```
DELETE /api/v1/keys/{key_id}
```

---

## Projects

### List all projects

```
GET /api/v1/projects
```

### Create a project

```
POST /api/v1/projects
```

Body:
```json
{
  "title": "My Video",
  "idea_id": "uuid (optional — creates from saved idea)",
  "language_code": "en (optional)",
  "status": "research (optional)"
}
```

### Get project details

```
GET /api/v1/projects/{id}
```

Returns full project with assets and active jobs.

### Update project

```
PATCH /api/v1/projects/{id}
```

Body (all fields optional):
```json
{
  "title": "New Title",
  "status": "outline",
  "outline": { "markdown": "..." },
  "idea_brief_markdown": "...",
  "youtube_description": "...",
  "language_code": "en",
  "title_variants": [...]
}
```

### Delete project

```
DELETE /api/v1/projects/{id}
```

Cascades to assets, jobs, and storage files.

---

## Project — Outline

### Generate outline (AI)

```
POST /api/v1/projects/{id}/outline
```

Body (optional):
```json
{ "context": "additional context for the AI" }
```

### Save outline

```
PATCH /api/v1/projects/{id}/outline
```

Body:
```json
{ "outline": { "markdown": "# My Outline\n..." } }
```

---

## Project — Idea Brief

### Get brief

```
GET /api/v1/projects/{id}/brief
```

### Update brief

```
PATCH /api/v1/projects/{id}/brief
```

Body:
```json
{ "idea_brief_markdown": "# Brief\n..." }
```

---

## Project — YouTube Description

### Generate description (AI, from transcript)

```
POST /api/v1/projects/{id}/description
```

Body:
```json
{ "transcript": "full video transcript text..." }
```

### Save description

```
PATCH /api/v1/projects/{id}/description
```

Body:
```json
{ "description": "Your description text..." }
```

---

## Project — Titles

### Generate title variants (AI)

```
POST /api/v1/projects/{id}/titles
```

Body (optional):
```json
{ "count": 10 }
```

---

## Project — Thumbnail

### Generate from reference

```
POST /api/v1/projects/{id}/thumbnail
```

Body:
```json
{
  "reference_thumbnail_url": "https://...",
  "headshot_id": "uuid (optional)",
  "preset_style_id": "uuid (optional)",
  "text_modifications": "Change text to X (optional)",
  "prompt_additions": "extra prompt (optional)",
  "count": 2
}
```

Returns `{ job_id, status, headshot_used }`. Poll job for completion.

### Iterate on thumbnail

```
PATCH /api/v1/projects/{id}/thumbnail
```

Body:
```json
{
  "previous_thumbnail_asset_id": "uuid",
  "refinement_prompt": "Make the text bigger",
  "count": 2
}
```

### Delete thumbnail

```
DELETE /api/v1/projects/{id}/thumbnail
```

Body:
```json
{ "asset_id": "uuid" }
```

---

## Project — Video Upload

### Upload a video file

```
POST /api/v1/projects/{id}/upload
```

Multipart form data with `file` field. Max 2GB, video files only.

```bash
curl -X POST http://localhost:3000/api/v1/projects/{id}/upload \
  -H "Authorization: Bearer vibe_..." \
  -F "file=@./video.mp4"
```

Returns `{ asset_id, job_id }`. Processing starts automatically.

### Reprocess video

```
POST /api/v1/projects/{id}/reprocess
```

Re-runs processing with current profile settings.

---

## Project — Assets

### List assets

```
GET /api/v1/projects/{id}/assets
```

Asset types: `raw_video`, `processed_video`, `transcript`, `thumbnail`, `edit_report`

### Download asset

```
GET /api/v1/projects/{id}/assets/{asset_id}/download
```

Returns a signed URL valid for 1 hour:
```json
{ "download_url": "https://...", "expires_in": 3600, "type": "processed_video" }
```

---

## Tools (Generic)

### List all tools

```
GET /api/v1/tools
```

### Get tool schema

```
GET /api/v1/tools/{tool_name}
```

### Execute a tool

```
POST /api/v1/tools/{tool_name}
```

Body varies per tool. Search tools (`outlier_search`, `deep_research`) return a job_id for async polling.

Available tools:
- `channel_import_latest_20` — Import latest 20 videos from a YouTube channel
- `outlier_search` — Search for outlier/viral videos (async)
- `deep_research` — AI-generated video ideas (async)
- `idea_enrich` — Enrich a saved idea with transcript + hooks
- `video_subtitles_fetch` — Fetch YouTube video subtitles
- `project_create_from_idea` — Create project from a saved idea
- `project_generate_outline` — Generate video outline
- `project_generate_titles` — Generate title variants
- `video_upload_finalize` — Finalize a video upload
- `headshot_pose_analyze` — Analyze headshot pose
- `thumbnail_generate_from_reference` — Generate thumbnail from reference
- `thumbnail_iterate` — Iterate on a thumbnail

---

## Jobs

### Get job status

```
GET /api/v1/jobs/{id}
```

Job statuses: `queued`, `running`, `succeeded`, `failed`, `search_queued`, `search_running`

For succeeded search jobs, includes `search_results` with the full result data.

---

## Ideas

### List saved ideas

```
GET /api/v1/ideas
```

Query params:
- `search_result_id` — Filter by search result
- `status` — Filter by status (`saved`, `project_created`)

### Get idea details

```
GET /api/v1/ideas/{id}
```

Returns idea with source video info.

### Save an idea

```
POST /api/v1/ideas
```

Body:
```json
{
  "video_id": "uuid",
  "score": 85,
  "score_breakdown": {},
  "search_result_id": "uuid (optional)"
}
```

Automatically queues an enrichment job.

### Delete an idea

```
DELETE /api/v1/ideas/{id}
```

---

## Typical Workflow

1. **Research**: `POST /api/v1/tools/outlier_search` → poll job → review results
2. **Save idea**: `POST /api/v1/ideas` with a video from search results
3. **Create project**: `POST /api/v1/projects` with `idea_id`
4. **Generate brief**: Automatically created from idea
5. **Generate outline**: `POST /api/v1/projects/{id}/outline`
6. **Generate titles**: `POST /api/v1/projects/{id}/titles`
7. **Upload video**: `POST /api/v1/projects/{id}/upload` → poll job
8. **Download processed video**: `GET /api/v1/projects/{id}/assets/{id}/download`
9. **Generate description**: `POST /api/v1/projects/{id}/description`
10. **Generate thumbnail**: `POST /api/v1/projects/{id}/thumbnail` → poll job
11. **Download thumbnail**: `GET /api/v1/projects/{id}/assets/{id}/download`
