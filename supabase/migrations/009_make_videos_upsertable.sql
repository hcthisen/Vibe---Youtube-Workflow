-- Make videos table upsertable by (user_id, youtube_video_id)
-- The app uses Supabase `.upsert(..., { onConflict: "user_id,youtube_video_id" })`.
-- Postgres requires a UNIQUE/EXCLUSION constraint on the conflict target.

-- 1) De-duplicate existing rows (keep newest) to allow UNIQUE index creation.
-- Only for rows with a youtube_video_id (nulls are allowed).
WITH ranked AS (
  SELECT
    id,
    user_id,
    youtube_video_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, youtube_video_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.videos
  WHERE youtube_video_id IS NOT NULL
)
DELETE FROM public.videos v
USING ranked r
WHERE v.id = r.id
  AND r.rn > 1;

-- 2) Create a partial UNIQUE index so upserts work and null youtube_video_id remains allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_user_youtube_unique
  ON public.videos(user_id, youtube_video_id)
  WHERE youtube_video_id IS NOT NULL;


