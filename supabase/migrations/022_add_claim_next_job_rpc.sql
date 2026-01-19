-- Add RPC for atomically claiming queued jobs (avoids direct DB access from workers)

CREATE OR REPLACE FUNCTION public.claim_next_job(supported_types text[])
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_row public.jobs%ROWTYPE;
BEGIN
    SELECT *
    INTO job_row
    FROM public.jobs
    WHERE status = 'queued'
      AND type = ANY(supported_types)
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.jobs
    SET status = 'running',
        updated_at = NOW()
    WHERE id = job_row.id;

    SELECT * INTO job_row FROM public.jobs WHERE id = job_row.id;

    RETURN job_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_job(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_job(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_job(job_id uuid, job_output jsonb)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_row public.jobs%ROWTYPE;
BEGIN
    UPDATE public.jobs
    SET status = 'succeeded',
        output = job_output,
        error = NULL,
        updated_at = NOW()
    WHERE id = job_id
    RETURNING * INTO job_row;

    RETURN job_row;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_job(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_job(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_job(job_id uuid, job_error text)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_row public.jobs%ROWTYPE;
BEGIN
    UPDATE public.jobs
    SET status = 'failed',
        error = job_error,
        updated_at = NOW()
    WHERE id = job_id
    RETURNING * INTO job_row;

    RETURN job_row;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_job(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_job(uuid, text) TO service_role;
