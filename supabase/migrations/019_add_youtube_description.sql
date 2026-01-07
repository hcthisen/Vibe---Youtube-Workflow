-- Add YouTube description field to projects
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS youtube_description TEXT;
