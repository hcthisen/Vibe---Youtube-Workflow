import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";
import { executeTool } from "@/lib/tools/executor";

/**
 * POST /api/v1/projects/[id]/outline — Generate an outline via AI
 * Body: { context? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));

    const result = await executeTool({
      userId: auth.userId,
      toolName: "project_generate_outline",
      input: { project_id: id, context: body.context },
    });

    if (!result.success) return errorResponse(result.error || "Failed to generate outline", 500);
    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/projects/[id]/outline — Save/update the outline
 * Body: { outline: { markdown: "..." } }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const { outline } = await request.json();
    if (!outline) return errorResponse("outline is required");

    const supabase = getApiSupabase();
    const { data: project, error } = await supabase
      .from("projects")
      .update({ outline })
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
