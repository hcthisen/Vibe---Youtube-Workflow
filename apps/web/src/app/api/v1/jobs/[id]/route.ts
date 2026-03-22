import { NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * GET /api/v1/jobs/[id] — Get job status and output
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();

    const { data: jobData, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    const job = jobData as unknown as JobRow | null;

    if (error || !job) return errorResponse("Job not found", 404);

    // If succeeded with search results, include them
    let searchResults = null;
    if (job.status === "succeeded" && job.output) {
      const output = job.output as { search_result_id?: string };
      if (output.search_result_id) {
        const { data } = await supabase
          .from("search_results")
          .select("*")
          .eq("id", output.search_result_id)
          .single();
        searchResults = data;
      }
    }

    return successResponse({ job, search_results: searchResults });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
