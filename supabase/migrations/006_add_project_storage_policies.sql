-- Storage RLS policies for project-related buckets
-- Required so authenticated users can upload/access their own files in project buckets.

-- Ensure RLS is enabled (Supabase enables this by default, but keep it explicit)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (for safe re-running)
-- ============================================================================

-- project-raw-videos
DROP POLICY IF EXISTS "Project raw videos: select own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project raw videos: insert own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project raw videos: update own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project raw videos: delete own objects" ON storage.objects;

-- project-processed-videos
DROP POLICY IF EXISTS "Project processed videos: select own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project processed videos: insert own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project processed videos: update own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project processed videos: delete own objects" ON storage.objects;

-- project-transcripts
DROP POLICY IF EXISTS "Project transcripts: select own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project transcripts: insert own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project transcripts: update own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project transcripts: delete own objects" ON storage.objects;

-- project-reports
DROP POLICY IF EXISTS "Project reports: select own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project reports: insert own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project reports: update own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project reports: delete own objects" ON storage.objects;

-- project-thumbnails
DROP POLICY IF EXISTS "Project thumbnails: public select" ON storage.objects;
DROP POLICY IF EXISTS "Project thumbnails: select own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project thumbnails: insert own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project thumbnails: update own objects" ON storage.objects;
DROP POLICY IF EXISTS "Project thumbnails: delete own objects" ON storage.objects;

-- ============================================================================
-- PROJECT RAW VIDEOS BUCKET POLICIES
-- ============================================================================

-- Users can list/read only their own raw video objects
CREATE POLICY "Project raw videos: select own objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-raw-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload only to their own folder inside the bucket (path must start with their user id)
CREATE POLICY "Project raw videos: insert own objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-raw-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update only their own objects
CREATE POLICY "Project raw videos: update own objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-raw-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'project-raw-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete only their own objects
CREATE POLICY "Project raw videos: delete own objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-raw-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- PROJECT PROCESSED VIDEOS BUCKET POLICIES
-- ============================================================================

-- Users can list/read only their own processed video objects
CREATE POLICY "Project processed videos: select own objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-processed-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload only to their own folder inside the bucket
CREATE POLICY "Project processed videos: insert own objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-processed-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update only their own objects
CREATE POLICY "Project processed videos: update own objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-processed-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'project-processed-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete only their own objects
CREATE POLICY "Project processed videos: delete own objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-processed-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- PROJECT TRANSCRIPTS BUCKET POLICIES
-- ============================================================================

-- Users can list/read only their own transcript objects
CREATE POLICY "Project transcripts: select own objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-transcripts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload only to their own folder inside the bucket
CREATE POLICY "Project transcripts: insert own objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-transcripts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update only their own objects
CREATE POLICY "Project transcripts: update own objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-transcripts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'project-transcripts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete only their own objects
CREATE POLICY "Project transcripts: delete own objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-transcripts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- PROJECT REPORTS BUCKET POLICIES
-- ============================================================================

-- Users can list/read only their own report objects
CREATE POLICY "Project reports: select own objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload only to their own folder inside the bucket
CREATE POLICY "Project reports: insert own objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update only their own objects
CREATE POLICY "Project reports: update own objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'project-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete only their own objects
CREATE POLICY "Project reports: delete own objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- PROJECT THUMBNAILS BUCKET POLICIES
-- ============================================================================
-- Note: Thumbnails bucket is PUBLIC for sharing, so anyone can view
-- But only owners can insert/update/delete

-- Public can view all thumbnails (for sharing)
CREATE POLICY "Project thumbnails: public select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'project-thumbnails');

-- Users can upload only to their own folder inside the bucket
CREATE POLICY "Project thumbnails: insert own objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-thumbnails'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update only their own objects
CREATE POLICY "Project thumbnails: update own objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'project-thumbnails'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete only their own objects
CREATE POLICY "Project thumbnails: delete own objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-thumbnails'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

