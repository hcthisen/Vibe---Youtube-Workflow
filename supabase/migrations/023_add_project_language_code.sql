-- Capture project language selection as a first-class column.
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS language_code TEXT;

UPDATE public.projects
SET language_code = 'en'
WHERE language_code IS NULL;

ALTER TABLE public.projects
ALTER COLUMN language_code SET DEFAULT 'en';

ALTER TABLE public.projects
ALTER COLUMN language_code SET NOT NULL;
