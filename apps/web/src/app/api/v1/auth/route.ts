import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/auth — Verify API key and return user info
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, default_language_code, llm_model")
      .eq("id", auth.userId)
      .single();

    return successResponse({
      user_id: auth.userId,
      display_name: profile?.display_name,
      default_language_code: profile?.default_language_code,
      llm_model: profile?.llm_model,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
