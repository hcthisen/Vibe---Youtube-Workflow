import { NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

type IdeaRow = Database["public"]["Tables"]["ideas"]["Row"];

/**
 * GET /api/v1/ideas/[id] — Get full idea details
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

    const { data: ideaData, error } = await supabase
      .from("ideas")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    const idea = ideaData as unknown as IdeaRow | null;

    if (error || !idea) return errorResponse("Idea not found", 404);

    // Get source video details
    let video = null;
    if (idea.source_video_id) {
      const { data } = await supabase
        .from("videos")
        .select("*")
        .eq("id", idea.source_video_id)
        .single();
      video = data;
    }

    return successResponse({ idea, source_video: video });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/ideas/[id] — Delete an idea
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
    const { error } = await supabase
      .from("ideas")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.userId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
