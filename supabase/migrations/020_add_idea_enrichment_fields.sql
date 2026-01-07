-- Add enrichment fields to ideas (transcript + deep research metadata)
ALTER TABLE public.ideas
ADD COLUMN IF NOT EXISTS transcript TEXT,
ADD COLUMN IF NOT EXISTS transcript_language TEXT,
ADD COLUMN IF NOT EXISTS why_now TEXT,
ADD COLUMN IF NOT EXISTS search_queries_used JSONB;
