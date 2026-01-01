-- Fix videos unique index to be compatible with ON CONFLICT inference.
-- Postgres cannot infer a PARTIAL unique index for `ON CONFLICT (user_id, youtube_video_id)`
-- unless the conflict target includes a matching WHERE predicate.
-- Supabase `upsert({ onConflict: "user_id,youtube_video_id" })` generates no predicate,
-- so we need a NON-PARTIAL unique index.

-- Drop the partial index created in 009 (if present)
DROP INDEX IF EXISTS public.idx_videos_user_youtube_unique;

-- Create a non-partial unique index. NULL youtube_video_id values remain allowed (multiple NULLs OK).
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_user_youtube_unique
  ON public.videos(user_id, youtube_video_id);


