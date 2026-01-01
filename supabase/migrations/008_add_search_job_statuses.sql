-- Add Search Job Statuses
-- This migration adds dedicated statuses for async search jobs so they don't
-- get picked up by the media worker (which polls only status='queued').

-- ============================================================================
-- UPDATE JOBS TABLE STATUS CONSTRAINT
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Add new constraint including search-specific statuses
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_status_check
    CHECK (status IN (
        'queued',
        'running',
        'succeeded',
        'failed',
        'search_queued',
        'search_running'
    ));

-- ============================================================================
-- INDEXES FOR SEARCH JOB QUEUE POLLING
-- ============================================================================

-- Optimized for the search worker polling queued search jobs
CREATE INDEX IF NOT EXISTS idx_jobs_search_queue
    ON public.jobs(status, created_at)
    WHERE status IN ('search_queued', 'search_running');

-- Optimized for search-worker concurrency checks per user/type
CREATE INDEX IF NOT EXISTS idx_jobs_user_search_type_status
    ON public.jobs(user_id, type, status)
    WHERE status IN ('search_queued', 'search_running');


