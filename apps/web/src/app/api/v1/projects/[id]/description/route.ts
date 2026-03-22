import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";
import { getOpenAIClient } from "@/lib/integrations/openai";

/**
 * POST /api/v1/projects/[id]/description — Generate YouTube description from transcript
 * Body: { transcript: "..." }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const { transcript } = await request.json();
    if (typeof transcript !== "string" || transcript.trim().length === 0) {
      return errorResponse("transcript text is required");
    }

    const supabase = getApiSupabase();
    const { data: project } = await supabase
      .from("projects")
      .select("id, language_code")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!project) return errorResponse("Project not found", 404);

    const result = await getOpenAIClient().generateYouTubeDescription({
      transcript,
      languageCode: project.language_code,
    });

    if (!result.success) {
      return errorResponse(result.error || "Failed to generate description", 500);
    }

    await supabase
      .from("projects")
      .update({ youtube_description: result.description })
      .eq("id", id)
      .eq("user_id", auth.userId);

    return successResponse({ description: result.description });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/projects/[id]/description — Save YouTube description directly
 * Body: { description: "..." }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const { description } = await request.json();
    if (typeof description !== "string") {
      return errorResponse("description must be a string");
    }

    const supabase = getApiSupabase();
    const { data: project, error } = await supabase
      .from("projects")
      .update({ youtube_description: description })
      .eq("id", id)
      .eq("user_id", auth.userId)
      .select("id, youtube_description")
      .single();

    if (error) return errorResponse(error.message, 500);
    if (!project) return errorResponse("Project not found", 404);

    return successResponse({ description: project.youtube_description });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
