-- Configure Storage for Large File Support
-- This migration ensures video buckets are properly configured for 2GB uploads

-- Update bucket configuration for video storage
-- Set allowed_mime_types to NULL to allow all types (Supabase validates by file extension)
UPDATE storage.buckets 
SET 
    file_size_limit = 2147483648,  -- 2GB in bytes
    allowed_mime_types = NULL  -- Allow all MIME types
WHERE id IN ('project-raw-videos', 'project-processed-videos');

-- Verify the configuration
SELECT 
    id, 
    name, 
    public,
    file_size_limit,
    ROUND(file_size_limit / 1024.0 / 1024.0 / 1024.0, 2) as size_limit_gb,
    allowed_mime_types
FROM storage.buckets 
WHERE id IN (
    'project-raw-videos',
    'project-processed-videos'
)
ORDER BY id;

