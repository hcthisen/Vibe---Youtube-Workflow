-- Add Thumbnail Preset Styles
-- This migration adds support for users to store preset thumbnail style images

-- Add thumbnail_preset_styles column to profiles table
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS thumbnail_preset_styles JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.thumbnail_preset_styles IS 'Array of preset thumbnail style references: [{id, bucket, path, name, created_at}]';

-- Create thumbnail-preset-styles storage bucket (will be created via Supabase dashboard or SDK)
-- This SQL is for reference; actual bucket creation handled by create-storage-buckets.ts

-- RLS policies for thumbnail-preset-styles bucket
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own thumbnail preset styles" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own thumbnail preset styles" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own thumbnail preset styles" ON storage.objects;

-- Users can upload their own preset styles
CREATE POLICY "Users can upload own thumbnail preset styles"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'thumbnail-preset-styles' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can view their own preset styles
CREATE POLICY "Users can view own thumbnail preset styles"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'thumbnail-preset-styles' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can delete their own preset styles
CREATE POLICY "Users can delete own thumbnail preset styles"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'thumbnail-preset-styles' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Index for faster profile lookups (optional, profiles usually queried by id)
-- CREATE INDEX IF NOT EXISTS idx_profiles_preset_styles ON public.profiles USING GIN (thumbnail_preset_styles);

