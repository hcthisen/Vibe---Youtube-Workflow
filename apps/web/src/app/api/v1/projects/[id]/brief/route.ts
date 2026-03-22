import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/projects/[id]/brief — Get the idea brief
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
      .select("id, idea_brief_markdown")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (error || !project) return errorResponse("Project not found", 404);

    return successResponse({ idea_brief_markdown: project.idea_brief_markdown });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/projects/[id]/brief — Update the idea brief
 * Body: { idea_brief_markdown: "..." }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const { idea_brief_markdown } = await request.json();
    if (typeof idea_brief_markdown !== "string") {
      return errorResponse("idea_brief_markdown must be a string");
    }

    const supabase = getApiSupabase();
    const { data: project, error } = await supabase
      .from("projects")
      .update({ idea_brief_markdown })
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
