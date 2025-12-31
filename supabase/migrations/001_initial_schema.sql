-- YouTube Production Assistant - Initial Schema
-- This migration creates all tables required for the MVP

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE
-- Stores user settings and preferences
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    silence_threshold_ms INTEGER DEFAULT 500,
    retake_markers JSONB DEFAULT '[]'::jsonb,
    intro_transition_enabled BOOLEAN DEFAULT false,
    default_language_code TEXT,
    default_location_code INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- HEADSHOTS TABLE
-- Stores user headshots with pose analysis
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

-- RLS for headshots
ALTER TABLE public.headshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own headshots"
    ON public.headshots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own headshots"
    ON public.headshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own headshots"
    ON public.headshots FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own headshots"
    ON public.headshots FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- CHANNELS TABLE
-- Stores YouTube channel baseline data
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel_identifier TEXT NOT NULL,
    baseline_video_ids JSONB DEFAULT '[]'::jsonb,
    baseline_summary TEXT,
    baseline_keywords JSONB DEFAULT '[]'::jsonb,
    avg_views NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for channels
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own channels"
    ON public.channels FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own channels"
    ON public.channels FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own channels"
    ON public.channels FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own channels"
    ON public.channels FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- VIDEOS TABLE
-- Stores imported videos from research
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

-- RLS for videos
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos"
    ON public.videos FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own videos"
    ON public.videos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos"
    ON public.videos FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos"
    ON public.videos FOR DELETE
    USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON public.videos(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_source ON public.videos(user_id, source);

-- ============================================================================
-- IDEAS TABLE
-- Stores video ideas from outlier search or deep research
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
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'saved', 'discarded')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for ideas
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ideas"
    ON public.ideas FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ideas"
    ON public.ideas FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ideas"
    ON public.ideas FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ideas"
    ON public.ideas FOR DELETE
    USING (auth.uid() = user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_ideas_user_status ON public.ideas(user_id, status);

-- ============================================================================
-- PROJECTS TABLE
-- Stores video production projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idea_id UUID REFERENCES public.ideas(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'research' CHECK (status IN ('research', 'outline', 'record', 'edit', 'thumbnail', 'done')),
    outline JSONB,
    title_variants JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);

-- ============================================================================
-- PROJECT_ASSETS TABLE
-- Stores files associated with projects
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

-- RLS for project_assets
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assets"
    ON public.project_assets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets"
    ON public.project_assets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets"
    ON public.project_assets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own assets"
    ON public.project_assets FOR DELETE
    USING (auth.uid() = user_id);

-- Index for project lookups
CREATE INDEX IF NOT EXISTS idx_assets_project ON public.project_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON public.project_assets(project_id, type);

-- ============================================================================
-- JOBS TABLE
-- Stores background job status
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('video_process', 'transcribe', 'thumbnail_generate', 'pose_analyze', 'research_run')),
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
    ON public.jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
    ON public.jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
    ON public.jobs FOR UPDATE
    USING (auth.uid() = user_id);

-- Index for status filtering (worker polling)
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON public.jobs(user_id, status);

-- ============================================================================
-- TOOL_RUNS TABLE
-- Stores tool execution logs for debugging
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

-- RLS for tool_runs
ALTER TABLE public.tool_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tool_runs"
    ON public.tool_runs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tool_runs"
    ON public.tool_runs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tool_runs"
    ON public.tool_runs FOR UPDATE
    USING (auth.uid() = user_id);

-- Index for recent runs
CREATE INDEX IF NOT EXISTS idx_tool_runs_recent ON public.tool_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_runs_tool ON public.tool_runs(tool_name, created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- Auto-update updated_at timestamp on row changes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY['profiles', 'headshots', 'channels', 'videos', 'ideas', 'projects', 'project_assets', 'jobs', 'tool_runs'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON public.%s', t, t);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
    END LOOP;
END;
$$;

-- ============================================================================
-- STORAGE POLICIES
-- Note: Storage buckets must be created via Supabase Dashboard or API
-- These policies should be applied after bucket creation
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

