import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";
import { executeTool } from "@/lib/tools/executor";

/**
 * POST /api/v1/projects/[id]/titles — Generate title variants via AI
 * Body: { count?: number }
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
      toolName: "project_generate_titles",
      input: { project_id: id, count: body.count || 10 },
    });

    if (!result.success) return errorResponse(result.error || "Failed to generate titles", 500);
    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
