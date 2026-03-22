import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  authenticateApiKey,
  generateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * POST /api/v1/keys — Create a new API key
 * Accepts session auth (from webapp) or existing API key auth.
 */
export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null;

    // Try API key auth first
    const apiAuth = await authenticateApiKey(request);
    if (apiAuth) {
      userId = apiAuth.userId;
    } else {
      // Fall back to session auth
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const name = body.name || "default";

    const { raw, hash, prefix } = generateApiKey();
    const supabase = getApiSupabase();

    const { error } = await supabase.from("api_keys").insert({
      user_id: userId,
      key_hash: hash,
      key_prefix: prefix,
      name,
    });

    if (error) return errorResponse(error.message, 500);

    // Return the raw key ONCE — it cannot be retrieved again
    return successResponse({
      key: raw,
      prefix,
      name,
      message: "Store this key securely. It cannot be retrieved again.",
    }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * GET /api/v1/keys — List API keys (metadata only, not the raw key)
 */
export async function GET(request: NextRequest) {
  try {
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
    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, last_used_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return errorResponse(error.message, 500);

    return successResponse({ keys: keys || [] });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
