-- Add Enable/Disable Flag for Retake Detection
-- This migration adds a boolean flag to control whether retake detection is active

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS retake_detection_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.profiles.retake_detection_enabled IS 'Enable or disable LLM-based retake detection. When disabled, retake markers are ignored. Default: false';

