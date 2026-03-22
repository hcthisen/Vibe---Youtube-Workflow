import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * DELETE /api/v1/keys/[id] — Revoke an API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let userId: string | null = null;

    const apiAuth = await authenticateApiKey(request);
    if (apiAuth) {
      userId = apiAuth.userId;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    if (!userId) return unauthorizedResponse();

    const supabase = getApiSupabase();
    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return errorResponse(error.message, 500);

    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
