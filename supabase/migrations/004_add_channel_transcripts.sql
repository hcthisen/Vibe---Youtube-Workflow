-- Add transcript storage to channels table
-- This allows us to store video transcripts alongside baseline data

ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS baseline_transcripts JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.channels.baseline_transcripts IS 'Array of {video_id, title, transcript} objects for baseline videos';

