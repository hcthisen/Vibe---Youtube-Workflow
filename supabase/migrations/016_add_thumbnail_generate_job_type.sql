-- Add thumbnail_generate Job Type
-- This migration adds thumbnail_generate to the jobs table type constraint

-- Drop existing constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_type_check;

-- Add new constraint with thumbnail_generate and thumbnail_iterate included
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_type_check 
    CHECK (type IN (
        'video_process', 
        'transcribe', 
        'thumbnail_generate',
        'thumbnail_iterate', 
        'pose_analyze', 
        'research_run',
        'outlier_search',
        'deep_research'
    ));

-- Add index for thumbnail generation job queries
CREATE INDEX IF NOT EXISTS idx_jobs_thumbnail_generate
    ON public.jobs(user_id, type, status)
    WHERE type = 'thumbnail_generate';

COMMENT ON INDEX idx_jobs_thumbnail_generate IS 'Optimized for querying thumbnail generation jobs by user';

