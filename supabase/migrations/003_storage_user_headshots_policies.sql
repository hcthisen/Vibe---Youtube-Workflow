-- Storage RLS policies for user headshots
-- Required so authenticated users can upload/delete their own files in the `user-headshots` bucket.

-- Ensure RLS is enabled (Supabase enables this by default, but keep it explicit)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any) to allow re-running safely
DROP POLICY IF EXISTS "User headshots: select own objects" ON storage.objects;
DROP POLICY IF EXISTS "User headshots: insert own objects" ON storage.objects;
DROP POLICY IF EXISTS "User headshots: update own objects" ON storage.objects;
DROP POLICY IF EXISTS "User headshots: delete own objects" ON storage.objects;

-- Users can list/read only their own headshot objects
CREATE POLICY "User headshots: select own objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-headshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload only to their own folder inside the bucket (path must start with their user id)
CREATE POLICY "User headshots: insert own objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-headshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update only their own objects (rarely needed, but safe)
CREATE POLICY "User headshots: update own objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-headshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'user-headshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete only their own objects
CREATE POLICY "User headshots: delete own objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-headshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


