-- Enhance Retake Detection Configuration
-- This migration adds advanced configuration options for LLM-based retake detection

-- Add new columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS retake_context_window_seconds INTEGER DEFAULT 30;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS retake_min_confidence DECIMAL(3,2) DEFAULT 0.70;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS retake_prefer_sentence_boundaries BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS llm_model VARCHAR(50) DEFAULT 'gpt-4.1';

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.retake_context_window_seconds IS 'Size of context window (in seconds) around retake markers for LLM analysis. Default: 30s';
COMMENT ON COLUMN public.profiles.retake_min_confidence IS 'Minimum confidence score (0-1) required to accept LLM-generated cuts. Lower scores trigger fallback. Default: 0.70';
COMMENT ON COLUMN public.profiles.retake_prefer_sentence_boundaries IS 'When enabled, LLM and fallback heuristics prefer cutting at sentence boundaries for more natural edits. Default: true';
COMMENT ON COLUMN public.profiles.llm_model IS 'OpenAI model to use for retake analysis. Options: gpt-4.1, gpt-4.1-mini. Default: gpt-4.1';

-- Add check constraints for validation
ALTER TABLE public.profiles ADD CONSTRAINT retake_context_window_range 
    CHECK (retake_context_window_seconds >= 10 AND retake_context_window_seconds <= 120);

ALTER TABLE public.profiles ADD CONSTRAINT retake_min_confidence_range 
    CHECK (retake_min_confidence >= 0.0 AND retake_min_confidence <= 1.0);

ALTER TABLE public.profiles ADD CONSTRAINT llm_model_valid 
    CHECK (llm_model IN ('gpt-4.1', 'gpt-4.1-mini'));
