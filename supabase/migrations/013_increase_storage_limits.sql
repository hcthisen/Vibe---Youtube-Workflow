-- Increase Storage Upload Limits to 2GB for Video Buckets
-- This migration updates file size limits for video storage buckets

-- Update bucket size limits (2GB = 2147483648 bytes)
UPDATE storage.buckets 
SET file_size_limit = 2147483648 
WHERE id IN (
    'project-raw-videos',
    'project-processed-videos'
);

-- Verify the update
SELECT 
    id, 
    name, 
    public,
    file_size_limit,
    ROUND(file_size_limit / 1024.0 / 1024.0 / 1024.0, 2) as size_limit_gb
FROM storage.buckets 
WHERE id IN (
    'project-raw-videos',
    'project-processed-videos',
    'project-transcripts',
    'project-reports',
    'project-thumbnails',
    'user-headshots'
)
ORDER BY id;

