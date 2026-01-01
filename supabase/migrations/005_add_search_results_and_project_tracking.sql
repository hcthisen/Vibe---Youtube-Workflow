-- Add Search Results & Project Tracking
-- This migration adds search results storage and project creation tracking

-- ============================================================================
-- SEARCH_RESULTS TABLE
-- Stores full search results from outlier search and deep research
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.search_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_type TEXT NOT NULL CHECK (search_type IN ('outlier_search', 'deep_research')),
    search_params JSONB DEFAULT '{}'::jsonb,
    results JSONB DEFAULT '[]'::jsonb,
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for search_results
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search results"
    ON public.search_results FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search results"
    ON public.search_results FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own search results"
    ON public.search_results FOR DELETE
    USING (auth.uid() = user_id);

-- Index for recent searches
CREATE INDEX IF NOT EXISTS idx_search_results_user_type ON public.search_results(user_id, search_type, created_at DESC);

-- ============================================================================
-- UPDATE IDEAS TABLE
-- Add search_result_id and update status constraint
-- ============================================================================

-- Add search_result_id column
ALTER TABLE public.ideas
    ADD COLUMN IF NOT EXISTS search_result_id UUID REFERENCES public.search_results(id) ON DELETE SET NULL;

-- Drop old status constraint and add new one with 'project_created'
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas 
    ADD CONSTRAINT ideas_status_check 
    CHECK (status IN ('new', 'saved', 'discarded', 'project_created'));

-- Index for search result lookup
CREATE INDEX IF NOT EXISTS idx_ideas_search_result ON public.ideas(search_result_id);

-- ============================================================================
-- UPDATE PROJECTS TABLE
-- Add idea_brief_markdown field
-- ============================================================================

-- Add idea_brief_markdown column
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS idea_brief_markdown TEXT;

-- ============================================================================
-- UPDATE TRIGGER FOR search_results
-- ============================================================================
CREATE TRIGGER update_search_results_updated_at 
    BEFORE UPDATE ON public.search_results 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- Note: We add created_at tracking but search_results doesn't need updated_at
-- since search results are immutable once created



