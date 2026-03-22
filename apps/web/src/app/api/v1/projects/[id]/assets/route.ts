import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/projects/[id]/assets — List all assets for a project
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

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!project) return errorResponse("Project not found", 404);

    const { data: assets, error } = await supabase
      .from("project_assets")
      .select("id, type, bucket, path, metadata, created_at, updated_at")
      .eq("project_id", id)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (error) return errorResponse(error.message, 500);

    return successResponse({ assets: assets || [] });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
