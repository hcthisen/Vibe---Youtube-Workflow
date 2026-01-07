-- Add idea_enrich to jobs type constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_type_check;

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
        'deep_research',
        'idea_enrich'
    ));
