# PRD: YouTube Production Assistant (Next.js + Supabase + Tool-Based Workflows)

Version: 1.0 (MVP-only)  
Last updated: 2025-12-30

This PRD is the only specification a coding agent should need to implement the complete MVP.

---

## 0) Current repo state (important)

At repo start, these items exist at the root:

- `PRD.md` (this document)
- `Initial Templates - directives/`
  - `cross_niche_outliers.md`
  - `jump_cut_vad.md`
  - `pan_3d_transition.md`
  - `recreate_thumbnails.md`
  - `smart_video_edit.md`
- `Initial Templates - execution/`
  - `video_effects/` (folder)
  - `analyze_face_directions.py`
  - `insert_3d_transition.py`
  - `jump_cut_editor.py`
  - `jump_cut_vad_parallel.py`
  - `jump_cut_vad_singlepass.py`
  - `jump_cut_vad.py`
  - `pan_3d_transition.py`
  - `recreate_thumbnails.py`
  - `scrape_cross_niche_outliers.py`
  - `scrape_cross_niche_tubelab.py` (reference only, do not use in MVP)
  - `simple_video_edit.py`

### How to treat these templates
- The `.md` directive files describe workflows and intent. Treat them as “tool specs” and acceptance references.
- The `.py` scripts are reference implementations for video editing, thumbnail recreation, and face direction analysis.
- The MVP must make these capabilities runnable from the app via internal tool endpoints and background jobs.
- TubeLab must not be used. All YouTube research must use DataForSEO.

---

## 1) Summary

Build a web app that helps a creator research YouTube video ideas, turn ideas into projects, upload recordings, automatically edit talking-head videos (silence removal + intro transition), generate transcripts, and generate face-swapped thumbnail variants based on outlier thumbnails.

The app uses:
- Next.js (App Router) + TypeScript
- Supabase (Auth, Postgres, Storage)
- DataForSEO YouTube SERP API for research/outliers
- OpenAI API (GPT-5.2 / 5.1-nano, etc.) for text intelligence (outlines, summaries, deep research synthesis)
- Nano Banana Pro for thumbnail generation using Google AI Studio API key (in `.env`)
- A background worker for video processing that wraps the included Python scripts

---

## 2) MVP goals (only)

### MVP outcomes
A user can:
1) Log in, set profile defaults, and upload headshots.
2) Import latest 20 videos from their channel, deselect off-niche items, and save a niche baseline.
3) Run outlier searches (within niche and cross-niche) using DataForSEO and view explainable scoring.
4) Run Deep Research to produce new idea candidates.
5) Convert an idea into a Project and generate an outline, hooks, and title variants with OpenAI.
6) Upload a raw talking-head video to a Project and receive:
   - Processed video (silence removed, optional intro transition applied)
   - Transcript
   - Edit report (cuts performed and timing)
7) Generate 3 thumbnail variants using Nano Banana Pro, using best headshot angles, and iterate via refinement prompts.
8) See tool run logs and job history for debugging.

---

## 3) Non-goals (not part of MVP)
Do not build:
- YouTube upload/publishing automation (no OAuth to YouTube)
- Multi-channel per user
- Team accounts/collaboration
- Subscription billing or quota UI
- Full non-linear editor features (timelines, manual cutting UI)
- Real-time collaboration or shared project permissions

---

## 4) Primary users
- Solo creators producing talking-head videos frequently, who want faster editing, better packaging, and a structured workflow.

---

## 5) Key user journeys

### A) Onboarding and niche baseline
1. Sign up / log in.
2. Configure profile defaults:
   - Silence threshold (default 500ms)
   - Retake markers (optional phrases)
3. Provide YouTube channel URL or channel ID.
4. Import latest 20 videos.
5. Deselect off-niche videos.
6. Save baseline summary and keywords.

### B) Find ideas (Outliers)
1. Open Ideas.
2. Run:
   - Within-niche outlier search
   - Cross-niche outlier search
3. Review results:
   - Thumbnail, title, channel, published date
   - Views, outlier score, recency boost, modifier breakdown
   - AI summary (if transcript available)
   - Suggested title variants
4. Save or discard ideas.

### C) Deep Research (new idea generation)
1. Open Deep Research.
2. Choose constraints:
   - optional avoid topics
   - optional target viewer description
3. Run.
4. Review 20 to 50 idea candidates:
   - thesis, why-now, hook options, packaging notes
   - example supporting videos when available
5. Save ideas.

### D) Convert idea to project
1. Select an idea.
2. Create a Project.
3. Generate:
   - Outline (sections + beats)
   - Hook options
   - Title variants

### E) Upload and process raw video
1. Upload raw video to the project.
2. Background job runs:
   - silence removal using VAD (threshold from settings)
   - optional intro transition injection (if enabled/available)
   - transcript generation
3. View results:
   - preview processed video
   - read transcript
   - see edit report

### F) Generate thumbnails
1. Upload 3 to 5 headshots (profile settings).
2. Headshots are auto-categorized by yaw/pitch buckets.
3. Pick a reference thumbnail (from an outlier result or project).
4. Generate 3 variants.
5. Iterate with refinement prompt.
6. Select and save final thumbnail to the project.

---

## 6) Functional requirements

### 6.1 Authentication and security
- Supabase Auth (email/password is sufficient).
- RLS on all tables: user can only access their own rows.
- Supabase Storage objects are scoped to the owning user/project.

### 6.2 Profile settings
Fields:
- `silence_threshold_ms` (default: 500)
- `retake_markers` (array of phrases, default: empty)
- `intro_transition_enabled` (boolean, default: false)
- `default_language_code` (string, optional)
- `default_location_code` (number/int, optional)

Headshots:
- Upload 3 to 5 images.
- Auto-analyze pose (yaw/pitch).
- Bucket label stored (ex: `front`, `left`, `right`, `up-left`, `down-right`).
- Allow manual override of bucket label.

### 6.3 Channel baseline (latest 20)
- Input: channel URL or channel ID.
- Fetch latest 20 videos.
- UI allows user to deselect any.
- Persist baseline:
  - list of selected video IDs
  - derived niche keywords and summary (OpenAI)
  - computed average views from selected items (if views available)

### 6.4 Research and transcripts (DataForSEO)
- All YouTube research uses DataForSEO YouTube endpoints.
- Store raw provider responses for debugging.
- Fetch subtitles when available; otherwise mark transcript as unavailable.

### 6.5 Outlier scoring
Compute:
- `base_outlier = views_count / channel_avg_views`
- `recency_boost` = multiplier based on age (newer => higher)
- `modifier_boosts` = heuristics (optional simple keyword-based boosts)
- `final_score = base_outlier * recency_boost * (1 + modifiers_sum)`

The UI must show score breakdown fields.

### 6.6 Deep Research generation (OpenAI)
- Uses niche baseline summary and keywords as context.
- Produces structured idea candidates:
  - title concept
  - thesis
  - why it should work
  - hook options
  - suggested thumbnail text ideas
  - suggested search queries used (for transparency)

### 6.7 Projects
- Project created from an idea.
- Store outline JSON, title variants JSON, and associated reference videos.

### 6.8 Video processing pipeline (async)
Upload -> job -> worker -> outputs.

Pipeline outputs:
- Processed MP4
- Transcript JSON (word-level timestamps)
- Transcript TXT (plaintext)
- Edit report JSON:
  - original duration, processed duration
  - total silence removed
  - retake cuts with LLM reasoning and confidence scores
  - retake analysis settings used
  - processing steps applied

Core steps:
1. **Download** raw video from Supabase Storage
2. **VAD Silence Removal**: Use Silero VAD to detect speech segments and remove silences
   - Configurable threshold (default: 500ms)
   - Preserves intro (first segment starts at 0:00)
   - Adds padding around speech segments
3. **Transcription**: Use OpenAI Whisper to generate word-level transcript
   - Base model for accuracy/speed balance
   - Word-level timestamps for precise cuts
   - Both JSON and plaintext formats
4. **LLM-Based Retake Detection** (if retake markers configured):
   - Search transcript for user-configured phrases (e.g., "cut cut", "oops")
   - Extract context windows (default: 30s) around each marker
   - Send to GPT-5.2 with reasoning prompts
   - LLM analyzes context and returns optimal cut points with confidence scores
   - Handles variable-length mistakes (2 seconds to 30+ seconds)
   - Pattern recognition: quick fix, full redo, multiple attempts
   - Prefers sentence boundaries for natural cuts
   - Fallback to enhanced heuristics if LLM fails
   - Apply cuts via FFmpeg and update transcript
5. **Intro Transition** (if enabled):
   - Use Remotion-based 3D transition overlay
   - Preserves audio, applies visual effect
6. **Upload Outputs**:
   - Processed video to `project-processed-videos` bucket
   - Transcripts to `project-transcripts` bucket
   - Edit report to `project-reports` bucket
   - Create asset records in database

**Retake Detection Configuration** (per user profile):
- `retake_markers`: Array of trigger phrases (default: [])
- `retake_context_window_seconds`: Context size for LLM (default: 30, range: 10-120)
- `retake_min_confidence`: Minimum confidence score (default: 0.7, range: 0.0-1.0)
- `retake_prefer_sentence_boundaries`: Use natural cut points (default: true)
- OpenAI model is set globally via `OPENAI_MODEL` (default: `gpt-5.2`)

**LLM Analysis Flow**:
```
Retake Marker Found → Extract Context → Detect Pattern → LLM Analysis
                                                              ↓
                                            Return {cuts, reasoning, confidence}
                                                              ↓
                                Filter by min_confidence ← Apply Cuts → Update Transcript
                                         ↓ (if too low)
                              Enhanced Fallback Heuristics
```

**Fallback Behavior**:
If LLM analysis fails or returns low confidence:
1. Try sentence boundaries (punctuation + pauses)
2. Try VAD silence gaps
3. Use speech density-based lookback
4. Default to 10-second lookback

**Edit Report Structure**:
```json
{
  "original_duration_ms": 180000,
  "after_silence_removal_ms": 150000,
  "after_retake_cuts_ms": 140000,
  "silence_removed_ms": 30000,
  "retake_cuts_detailed": [
    {
      "start_time": 45.2,
      "end_time": 52.8,
      "reason": "Removed false start before 'cut cut'",
      "confidence": 0.92,
      "pattern": "full_redo",
      "method": "llm",
      "llm_reasoning": "Speaker restarted completely, natural boundary at 45.2s"
    }
  ],
  "retake_analysis_settings": {
    "llm_model": "gpt-5.2",
    "context_window_seconds": 30,
    "min_confidence": 0.7
  },
  "processing_steps": [
    "vad_silence_removal",
    "transcription",
    "llm_retake_cuts",
    "intro_transition"
  ]
}
```

**Implementation Notes**:
- Worker: `workers/media/worker.py`
- Handler: `workers/media/handlers/video_process.py`
- LLM Logic: `workers/media/utils/llm_cuts.py`
- Transcription: `workers/media/utils/transcription.py`
- VAD Processing: `workers/media/utils/vad_processor.py`

**Dependencies**:
- FFmpeg (video processing)
- OpenAI Whisper (transcription)
- OpenAI API (GPT-5.2 for retake analysis)
- Silero VAD (voice activity detection)
- Remotion + Node.js (intro transitions, optional)

### 6.9 Thumbnail generation (Nano Banana Pro)
Inputs:
- Source thumbnail image URL or asset
- Selected best headshot(s) based on face direction matching
- Prompt template + optional refinement text

Process:
1. Analyze face direction in source thumbnail (MediaPipe via worker; or reuse `analyze_face_directions.py` pattern).
2. Choose best headshot(s) by pose distance.
3. Call Nano Banana Pro using Google AI Studio API key.
4. Generate 3 variants and store them.

Iteration:
- User provides refinement prompt.
- Generate new variants and store them under the project.

---

## 7) Tool-based architecture (required)

All major actions are implemented as internal “tools” with:
- name + version
- Zod input/output schema
- a dedicated endpoint `/api/tools/<tool_name>`
- persistent tool run logs (`tool_runs`) containing:
  - request input
  - output payload
  - errors
  - execution time
  - references to created job IDs and asset IDs

Tools must be isolated so debugging can trace exactly what happened.

### Tool catalog (MVP)
Research:
- `channel_import_latest_20`
- `outlier_search`
- `deep_research`
- `video_subtitles_fetch` (used internally by research)

Projects:
- `project_create_from_idea`
- `project_generate_outline`
- `project_generate_titles`

Media jobs:
- `video_upload_finalize` (creates asset + job)
- `video_process_pipeline` (job handler, worker-side)
- `transcribe_video` (job handler, worker-side)

Thumbnails:
- `headshot_pose_analyze`
- `thumbnail_generate_from_reference`
- `thumbnail_iterate`

### Mapping existing templates to production tools
- `analyze_face_directions.py` -> `headshot_pose_analyze`
- `recreate_thumbnails.py` -> `thumbnail_generate_from_reference` + `thumbnail_iterate`
- `jump_cut_vad*.py` + `jump_cut_editor.py` -> `video_process_pipeline` (silence cuts)
- `insert_3d_transition.py` + `pan_3d_transition.py` -> intro step in `video_process_pipeline`
- `simple_video_edit.py` + `smart_video_edit.md` -> orchestration reference and expected output artifacts
- `scrape_cross_niche_outliers.py` + `cross_niche_outliers.md` -> implement using DataForSEO
- `scrape_cross_niche_tubelab.py` -> never called in MVP

---

## 8) Background worker (required)

### Recommended approach (MVP)
- Create a Python worker that wraps the included `.py` scripts.
- Worker polls the `jobs` table for queued work and updates job status.

Worker responsibilities:
- Download inputs from Supabase Storage
- Execute the relevant script(s) with standardized inputs
- Upload outputs to Storage
- Write structured output and logs to `jobs` and `tool_runs`

Standardization requirements:
- Every worker task accepts a JSON payload (from DB) and returns a JSON result.
- Every produced file is recorded in `project_assets`.

---

## 9) Suggested repo structure (agent must create)

Keep existing template folders; add production code under:

/apps
/web # Next.js app
/workers
/media # Python worker
/packages
/core # shared types
/tools # tool registry, zod schemas, helpers
/integrations # DataForSEO + OpenAI + Nano Banana clients
/supabase
/migrations
/policies
/Initial Templates - directives
/Initial Templates - execution
PRD.md


---

## 10) Data model (Supabase Postgres)

### Tables
- `profiles`
  - `id uuid pk` (matches auth.users)
  - `display_name text`
  - `silence_threshold_ms int`
  - `retake_markers jsonb`
  - `intro_transition_enabled bool`
  - `default_language_code text null`
  - `default_location_code int null`
  - timestamps

- `channels`
  - `id uuid pk`
  - `user_id uuid fk`
  - `channel_identifier text`
  - `baseline_video_ids jsonb`
  - `baseline_summary text`
  - `baseline_keywords jsonb`
  - `avg_views numeric null`
  - timestamps

- `videos`
  - `id uuid pk`
  - `user_id uuid fk`
  - `source text` (`channel_import` | `research`)
  - `youtube_video_id text null`
  - `title text`
  - `thumbnail_url text`
  - `published_at timestamptz null`
  - `views_count bigint null`
  - `channel_name text null`
  - `raw_provider_payload jsonb`
  - timestamps

- `ideas`
  - `id uuid pk`
  - `user_id uuid fk`
  - `source_video_id uuid fk videos.id null`
  - `score numeric`
  - `score_breakdown jsonb`
  - `ai_summary text null`
  - `title_variants jsonb`
  - `hook_options jsonb`
  - `status text` (`new` | `saved` | `discarded`)
  - timestamps

- `projects`
  - `id uuid pk`
  - `user_id uuid fk`
  - `idea_id uuid fk ideas.id null`
  - `title text`
  - `status text` (`research` | `outline` | `record` | `edit` | `thumbnail` | `done`)
  - `outline jsonb null`
  - `title_variants jsonb null`
  - timestamps

- `project_assets`
  - `id uuid pk`
  - `user_id uuid fk`
  - `project_id uuid fk`
  - `type text` (`raw_video` | `processed_video` | `transcript` | `edit_report` | `thumbnail` | `headshot`)
  - `bucket text`
  - `path text`
  - `metadata jsonb`
  - timestamps

- `jobs`
  - `id uuid pk`
  - `user_id uuid fk`
  - `project_id uuid fk null`
  - `type text` (`video_process` | `transcribe` | `thumbnail_generate` | `pose_analyze` | `research_run`)
  - `status text` (`queued` | `running` | `succeeded` | `failed`)
  - `input jsonb`
  - `output jsonb null`
  - `error text null`
  - timestamps

- `tool_runs`
  - `id uuid pk`
  - `user_id uuid fk`
  - `tool_name text`
  - `tool_version text`
  - `status text` (`started` | `succeeded` | `failed`)
  - `input jsonb`
  - `output jsonb null`
  - `logs text null`
  - `duration_ms int null`
  - timestamps

### RLS
- Every table enforces `user_id = auth.uid()`.
- `profiles.id = auth.uid()`.

---

## 11) Storage buckets (Supabase)
- `user-headshots`
- `project-raw-videos`
- `project-processed-videos`
- `project-transcripts`
- `project-reports`
- `project-thumbnails`

---

## 12) Environment variables (MVP fixed)

Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

DataForSEO:
- `DATAFORSEO_LOGIN`
- `DATAFORSEO_PASSWORD`

OpenAI (LLM):
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (example: `gpt-5.2`)

Nano Banana Pro (images via Google AI Studio key):
- `GOOGLE_AI_STUDIO_API_KEY`
- `NANO_BANANA_MODEL` (if required by provider)
- `NANO_BANANA_ENDPOINT` (if required by provider)

Worker:
- `WORKER_SHARED_SECRET`

---

## 13) UI screens (MVP)

Auth:
- Login / signup

Settings:
- Silence threshold + retake markers
- Headshots upload + auto-bucketing + manual override

Channel baseline:
- Channel connect/import
- Latest 20 videos list + deselect
- Save baseline summary

Ideas:
- Outlier search builder + results list
- Deep research run + results list
- Save/discard and convert to project

Projects:
- Outline generation + editor
- Raw video upload
- Processing status + logs
- Processed video preview
- Transcript viewer
- Thumbnail generation + drafts gallery + iteration

Debug:
- Tool run history
- Job history and error details

---

## 14) Acceptance criteria (Definition of Done)

The MVP is complete when:
- Auth + RLS + storage security are correct.
- Channel import fetches 20 videos and supports deselection.
- DataForSEO outlier search works end-to-end and stores explainable scores.
- Deep research produces structured idea candidates and saves them.
- Projects can be created and outlines/titles generated via OpenAI.
- Raw video upload triggers async processing and returns processed video + transcript + edit report.
- Headshots are pose-tagged and used to generate 3 thumbnail variants with Nano Banana Pro.
- Tool runs and jobs are logged and visible in the UI.

---

## 15) Build order (agent task breakdown)

1. Scaffold Next.js + Supabase auth + DB migrations + RLS.
2. Implement tool registry + `/api/tools/*` endpoints + `tool_runs` logging.
3. Implement worker service + job polling + secure access.
4. Implement profile settings + headshot upload + pose analysis tool.
5. Implement channel import + baseline UI + baseline summary (OpenAI).
6. Implement DataForSEO client + outlier search tool + scoring + Ideas UI.
7. Implement Deep Research tool + UI.
8. Implement Projects + outline/title generation tools + UI.
9. Implement raw upload + video processing pipeline wrapping existing Python scripts.
10. Implement thumbnail generation + iteration using Nano Banana Pro and pose matching.
11. Add Debug pages for tool runs and jobs, plus robust error handling.

---
End of MVP PRD.
