-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    silence_threshold_ms INTEGER DEFAULT 500,
    retake_markers JSONB DEFAULT '[]'::jsonb,
    intro_transition_enabled BOOLEAN DEFAULT false,
    default_language_code TEXT,
    default_location_code INTEGER,
    retake_context_window_seconds INTEGER DEFAULT 30,
    retake_min_confidence DECIMAL(3,2) DEFAULT 0.70,
    retake_prefer_sentence_boundaries BOOLEAN DEFAULT true,
    llm_model VARCHAR(50) DEFAULT 'gpt-4.1',
    retake_detection_enabled BOOLEAN DEFAULT false,
    thumbnail_preset_styles JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT retake_context_window_range CHECK (retake_context_window_seconds >= 10 AND retake_context_window_seconds <= 120),
    CONSTRAINT retake_min_confidence_range CHECK (retake_min_confidence >= 0.0 AND retake_min_confidence <= 1.0),
    CONSTRAINT llm_model_valid CHECK (llm_model IN ('gpt-4.1', 'gpt-4.1-mini'))
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- HEADSHOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.headshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bucket TEXT NOT NULL,
    path TEXT NOT NULL,
    pose_yaw REAL,
    pose_pitch REAL,
    pose_bucket TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.headshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own headshots" ON public.headshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own headshots" ON public.headshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own headshots" ON public.headshots FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own headshots" ON public.headshots FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- CHANNELS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel_identifier TEXT NOT NULL,
    baseline_video_ids JSONB DEFAULT '[]'::jsonb,
    baseline_summary TEXT,
    baseline_keywords JSONB DEFAULT '[]'::jsonb,
    avg_views NUMERIC,
    baseline_transcripts JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own channels" ON public.channels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own channels" ON public.channels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own channels" ON public.channels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own channels" ON public.channels FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- VIDEOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('channel_import', 'research')),
    youtube_video_id TEXT,
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    published_at TIMESTAMPTZ,
    views_count BIGINT,
    channel_name TEXT,
    raw_provider_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own videos" ON public.videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own videos" ON public.videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own videos" ON public.videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own videos" ON public.videos FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON public.videos(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_source ON public.videos(user_id, source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_user_youtube_unique ON public.videos(user_id, youtube_video_id);

-- ============================================================================
-- SEARCH RESULTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.search_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_type TEXT NOT NULL CHECK (search_type IN ('outlier_search', 'deep_research')),
    search_params JSONB DEFAULT '{}'::jsonb,
    results JSONB DEFAULT '[]'::jsonb,
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own search results" ON public.search_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own search results" ON public.search_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own search results" ON public.search_results FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_search_results_user_type ON public.search_results(user_id, search_type, created_at DESC);

-- ============================================================================
-- IDEAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
    score NUMERIC DEFAULT 0,
    score_breakdown JSONB DEFAULT '{}'::jsonb,
    ai_summary TEXT,
    title_variants JSONB DEFAULT '[]'::jsonb,
    hook_options JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'saved', 'discarded', 'project_created')),
    search_result_id UUID REFERENCES public.search_results(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ideas" ON public.ideas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ideas" ON public.ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ideas" ON public.ideas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ideas" ON public.ideas FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ideas_user_status ON public.ideas(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ideas_search_result ON public.ideas(search_result_id);

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idea_id UUID REFERENCES public.ideas(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'research' CHECK (status IN ('research', 'outline', 'record', 'edit', 'thumbnail', 'done')),
    outline JSONB,
    title_variants JSONB,
    idea_brief_markdown TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);

-- ============================================================================
-- PROJECT ASSETS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('raw_video', 'processed_video', 'transcript', 'edit_report', 'thumbnail', 'headshot')),
    bucket TEXT NOT NULL,
    path TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own assets" ON public.project_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assets" ON public.project_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assets" ON public.project_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assets" ON public.project_assets FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_assets_project ON public.project_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON public.project_assets(project_id, type);

-- ============================================================================
-- JOBS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('video_process', 'transcribe', 'thumbnail_generate', 'thumbnail_iterate', 'pose_analyze', 'research_run', 'outlier_search', 'deep_research')),
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'search_queued', 'search_running')),
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.jobs FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON public.jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON public.jobs(status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_jobs_user_type_status ON public.jobs(user_id, type, status) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_jobs_search_queue ON public.jobs(status, created_at) WHERE status IN ('search_queued', 'search_running');
CREATE INDEX IF NOT EXISTS idx_jobs_user_search_type_status ON public.jobs(user_id, type, status) WHERE status IN ('search_queued', 'search_running');
CREATE INDEX IF NOT EXISTS idx_jobs_thumbnail_generate ON public.jobs(user_id, type, status) WHERE type = 'thumbnail_generate';

-- ============================================================================
-- TOOL RUNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tool_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    tool_version TEXT NOT NULL,
    status TEXT DEFAULT 'started' CHECK (status IN ('started', 'succeeded', 'failed')),
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    logs TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tool_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tool_runs" ON public.tool_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tool_runs" ON public.tool_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tool_runs" ON public.tool_runs FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tool_runs_recent ON public.tool_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_runs_tool ON public.tool_runs(tool_name, created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_headshots_updated_at ON public.headshots;
CREATE TRIGGER update_headshots_updated_at BEFORE UPDATE ON public.headshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_channels_updated_at ON public.channels;
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON public.videos;
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_search_results_updated_at ON public.search_results;
CREATE TRIGGER update_search_results_updated_at BEFORE UPDATE ON public.search_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ideas_updated_at ON public.ideas;
CREATE TRIGGER update_ideas_updated_at BEFORE UPDATE ON public.ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_assets_updated_at ON public.project_assets;
CREATE TRIGGER update_project_assets_updated_at BEFORE UPDATE ON public.project_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tool_runs_updated_at ON public.tool_runs;
CREATE TRIGGER update_tool_runs_updated_at BEFORE UPDATE ON public.tool_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User headshots: select own objects" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'user-headshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User headshots: insert own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'user-headshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User headshots: update own objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'user-headshots' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'user-headshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "User headshots: delete own objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'user-headshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Project raw videos: select own objects" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-raw-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project raw videos: insert own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-raw-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project raw videos: update own objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-raw-videos' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'project-raw-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project raw videos: delete own objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-raw-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Project processed videos: select own objects" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-processed-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project processed videos: insert own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-processed-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project processed videos: update own objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-processed-videos' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'project-processed-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project processed videos: delete own objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-processed-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Project transcripts: select own objects" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project transcripts: insert own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project transcripts: update own objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'project-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project transcripts: delete own objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Project reports: select own objects" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-reports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project reports: insert own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-reports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project reports: update own objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-reports' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'project-reports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project reports: delete own objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-reports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Project thumbnails: public select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'project-thumbnails');
CREATE POLICY "Project thumbnails: insert own objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project thumbnails: update own objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'project-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Project thumbnails: delete own objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own thumbnail preset styles" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'thumbnail-preset-styles' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own thumbnail preset styles" ON storage.objects FOR SELECT USING (bucket_id = 'thumbnail-preset-styles' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own thumbnail preset styles" ON storage.objects FOR DELETE USING (bucket_id = 'thumbnail-preset-styles' AND auth.uid()::text = (storage.foldername(name))[1]);

UPDATE storage.buckets SET file_size_limit = 2147483648, allowed_mime_types = NULL WHERE id IN ('project-raw-videos', 'project-processed-videos');
