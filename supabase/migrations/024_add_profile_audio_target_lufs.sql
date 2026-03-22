-- Add configurable audio loudness target for processed videos
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS audio_target_lufs DECIMAL(4,1) DEFAULT -15.0;

UPDATE public.profiles
SET audio_target_lufs = -15.0
WHERE audio_target_lufs IS NULL;

COMMENT ON COLUMN public.profiles.audio_target_lufs IS
  'Target loudness for processed videos in LUFS. More negative values are quieter. Default: -15.0';

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_audio_target_lufs_range;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_audio_target_lufs_range
CHECK (audio_target_lufs >= -20.0 AND audio_target_lufs <= -10.0);
