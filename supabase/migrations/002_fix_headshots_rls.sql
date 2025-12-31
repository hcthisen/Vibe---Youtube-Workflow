-- Fix RLS policies for headshots table
-- This ensures users can insert, update, and delete their own headshots

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own headshots" ON public.headshots;
DROP POLICY IF EXISTS "Users can insert own headshots" ON public.headshots;
DROP POLICY IF EXISTS "Users can update own headshots" ON public.headshots;
DROP POLICY IF EXISTS "Users can delete own headshots" ON public.headshots;

-- Recreate policies with proper permissions
CREATE POLICY "Users can view own headshots"
    ON public.headshots FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own headshots"
    ON public.headshots FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own headshots"
    ON public.headshots FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own headshots"
    ON public.headshots FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Ensure RLS is enabled
ALTER TABLE public.headshots ENABLE ROW LEVEL SECURITY;

