import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/projects/[id] — Get full project details
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

    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (error || !project) return errorResponse("Project not found", 404);

    // Fetch assets
    const { data: assets } = await supabase
      .from("project_assets")
      .select("id, type, bucket, path, metadata, created_at")
      .eq("project_id", id)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    // Fetch active jobs
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, type, status, created_at, updated_at")
      .eq("project_id", id)
      .eq("user_id", auth.userId)
      .in("status", ["queued", "running", "search_queued", "search_running"])
      .order("created_at", { ascending: false });

    return successResponse({
      ...project,
      assets: assets || [],
      active_jobs: jobs || [],
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/projects/[id] — Update project fields
 * Body: { title?, status?, outline?, idea_brief_markdown?, youtube_description?, language_code?, title_variants? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    const allowedFields = [
      "title", "status", "outline", "idea_brief_markdown",
      "youtube_description", "language_code", "title_variants",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update");
    }

    const supabase = getApiSupabase();
    const { data: project, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("user_id", auth.userId)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    if (!project) return errorResponse("Project not found", 404);

    return successResponse(project);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/projects/[id] — Delete a project and its assets
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();

    // Verify ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!project) return errorResponse("Project not found", 404);

    // Delete storage files
    const { data: assets } = await supabase
      .from("project_assets")
      .select("bucket, path")
      .eq("project_id", id);

    if (assets && assets.length > 0) {
      const byBucket = assets.reduce((acc, a) => {
        if (!acc[a.bucket]) acc[a.bucket] = [];
        acc[a.bucket].push(a.path);
        return acc;
      }, {} as Record<string, string[]>);

      for (const [bucket, paths] of Object.entries(byBucket)) {
        await supabase.storage.from(bucket).remove(paths);
      }
    }

    // Delete project (cascades to assets, jobs)
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.userId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
