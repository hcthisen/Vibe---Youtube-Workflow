import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/projects/[id]/assets/[asset_id]/download — Get a signed download URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; asset_id: string }> }
) {
  try {
    const { id, asset_id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();

    // Verify ownership
    const { data: asset, error } = await supabase
      .from("project_assets")
      .select("id, bucket, path, type, metadata")
      .eq("id", asset_id)
      .eq("project_id", id)
      .eq("user_id", auth.userId)
      .single();

    if (error || !asset) return errorResponse("Asset not found", 404);

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from(asset.bucket)
      .createSignedUrl(asset.path, 3600);

    if (urlError || !signedUrl) {
      return errorResponse("Failed to generate download URL", 500);
    }

    return successResponse({
      download_url: signedUrl.signedUrl,
      expires_in: 3600,
      type: asset.type,
      metadata: asset.metadata,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
