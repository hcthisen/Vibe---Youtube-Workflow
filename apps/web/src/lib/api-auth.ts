import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import type { Database } from "@/lib/database.types";
import { NextRequest, NextResponse } from "next/server";

/**
 * Create a Supabase service client for API key operations.
 * Uses service role to bypass RLS since API key requests don't have a session.
 */
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** SHA-256 hash a raw API key */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Generate a new API key with vibe_ prefix */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `vibe_${randomBytes(32).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

export interface ApiAuthResult {
  userId: string;
}

/**
 * Authenticate a request using a Bearer API key.
 * Returns the userId or null if invalid.
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<ApiAuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey || !rawKey.startsWith("vibe_")) return null;

  const keyHash = hashApiKey(rawKey);
  const supabase = getServiceClient();

  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .single();

  if (error || !apiKey) return null;

  // Update last_used_at (fire and forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(() => {});

  return { userId: apiKey.user_id };
}

/**
 * Helper to get a service-role Supabase client scoped to a user.
 * Since API key auth bypasses RLS, we use the service client directly
 * but always filter by user_id in queries.
 */
export function getApiSupabase() {
  return getServiceClient();
}

/** Standard error response for unauthorized requests */
export function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: "Unauthorized. Provide a valid API key via Authorization: Bearer vibe_..." },
    { status: 401 }
  );
}

/** Standard error response */
export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Standard success response */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
