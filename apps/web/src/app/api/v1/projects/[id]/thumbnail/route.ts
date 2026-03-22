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
 * POST /api/v1/projects/[id]/thumbnail — Generate thumbnails from reference
 * Body: { reference_thumbnail_url, headshot_id?, preset_style_id?, text_modifications?, prompt_additions?, count? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();

    // Get idea brief for context
    const supabase = getApiSupabase();
    const { data: project } = await supabase
      .from("projects")
      .select("idea_brief_markdown")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    const result = await executeTool({
      userId: auth.userId,
      toolName: "thumbnail_generate_from_reference",
      input: {
        project_id: id,
        reference_thumbnail_url: body.reference_thumbnail_url,
        headshot_id: body.headshot_id,
        preset_style_id: body.preset_style_id,
        text_modifications: body.text_modifications,
        prompt_additions: body.prompt_additions,
        idea_brief_markdown: body.idea_brief_markdown || project?.idea_brief_markdown,
        count: body.count || 2,
      },
    });

    if (!result.success) return errorResponse(result.error || "Failed to generate thumbnail", 500);
    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * PATCH /api/v1/projects/[id]/thumbnail — Iterate on an existing thumbnail
 * Body: { previous_thumbnail_asset_id, refinement_prompt, headshot_id?, text_modifications?, count? }
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

    const supabase = getApiSupabase();
    const { data: project } = await supabase
      .from("projects")
      .select("idea_brief_markdown")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    const result = await executeTool({
      userId: auth.userId,
      toolName: "thumbnail_iterate",
      input: {
        project_id: id,
        previous_thumbnail_asset_id: body.previous_thumbnail_asset_id,
        refinement_prompt: body.refinement_prompt,
        headshot_id: body.headshot_id,
        text_modifications: body.text_modifications,
        idea_brief_markdown: body.idea_brief_markdown || project?.idea_brief_markdown,
        count: body.count || 2,
      },
    });

    if (!result.success) return errorResponse(result.error || "Failed to iterate thumbnail", 500);
    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/v1/projects/[id]/thumbnail — Delete a thumbnail
 * Body: { asset_id }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    if (!body.asset_id) return errorResponse("asset_id is required");

    const supabase = getApiSupabase();

    const { data: asset } = await supabase
      .from("project_assets")
      .select("id, bucket, path, user_id")
      .eq("id", body.asset_id)
      .eq("project_id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!asset) return errorResponse("Thumbnail not found", 404);

    // Delete from storage
    await supabase.storage.from(asset.bucket).remove([asset.path]);

    // Delete record
    await supabase.from("project_assets").delete().eq("id", body.asset_id);

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
