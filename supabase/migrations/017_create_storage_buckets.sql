-- Create storage buckets if they don't exist

-- user-headshots (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-headshots', 'user-headshots', false, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- thumbnail-preset-styles (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('thumbnail-preset-styles', 'thumbnail-preset-styles', false, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- project-raw-videos (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-raw-videos', 'project-raw-videos', false, 2147483648) -- 2GB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- project-processed-videos (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-processed-videos', 'project-processed-videos', false, 2147483648) -- 2GB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- project-transcripts (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-transcripts', 'project-transcripts', false, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- project-reports (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-reports', 'project-reports', false, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- project-thumbnails (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-thumbnails', 'project-thumbnails', true, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;
