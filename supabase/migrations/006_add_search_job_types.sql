-- Add Search Job Types
-- This migration adds support for async search jobs

-- ============================================================================
-- UPDATE JOBS TABLE TYPE CONSTRAINT
-- Add outlier_search and deep_research to job types
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_type_check;

-- Add new constraint with search job types
ALTER TABLE public.jobs 
    ADD CONSTRAINT jobs_type_check 
    CHECK (type IN (
        'video_process', 
        'transcribe', 
        'thumbnail_generate', 
        'pose_analyze', 
        'research_run',
        'outlier_search',
        'deep_research'
    ));

-- ============================================================================
-- ADD EFFICIENT JOB QUEUE INDEX
-- Optimized for worker polling queries
-- ============================================================================

-- Index for efficient job queue polling
CREATE INDEX IF NOT EXISTS idx_jobs_queue 
    ON public.jobs(status, created_at) 
    WHERE status IN ('queued', 'running');

-- Index for user-specific job queries (for concurrency checks)
CREATE INDEX IF NOT EXISTS idx_jobs_user_type_status 
    ON public.jobs(user_id, type, status) 
    WHERE status IN ('queued', 'running');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_jobs_queue IS 'Optimized for worker polling queued jobs';
COMMENT ON INDEX idx_jobs_user_type_status IS 'Optimized for checking user concurrency limits';



