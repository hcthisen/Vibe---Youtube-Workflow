-- Update retake analysis models to GPT-4.1 family

-- Drop old constraint to allow value updates
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS llm_model_valid;

-- Migrate existing values
UPDATE public.profiles
SET llm_model = 'gpt-4.1'
WHERE llm_model IN ('gpt-4', 'gpt-4o');

UPDATE public.profiles
SET llm_model = 'gpt-4.1-mini'
WHERE llm_model = 'gpt-4-turbo';

-- Set new default
ALTER TABLE public.profiles ALTER COLUMN llm_model SET DEFAULT 'gpt-4.1';

-- Update column comment
COMMENT ON COLUMN public.profiles.llm_model IS
    'OpenAI model to use for retake analysis. Options: gpt-4.1, gpt-4.1-mini. Default: gpt-4.1';

-- Add updated constraint
ALTER TABLE public.profiles ADD CONSTRAINT llm_model_valid
    CHECK (llm_model IN ('gpt-4.1', 'gpt-4.1-mini'));
