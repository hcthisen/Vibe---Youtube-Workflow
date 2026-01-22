import { createClient } from "@/lib/supabase/server";
import { validateExternalUrl } from "@/lib/security/external-url";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_PRESETS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;

function extFromContentType(contentType: string): string {
  if (contentType.includes("image/jpeg")) return "jpg";
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/gif")) return "gif";
  return "jpg";
}

async function fetchImageWithLimit(rawUrl: string, maxBytes: number): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const validation = await validateExternalUrl(currentUrl);
    if (!validation.ok || !validation.normalizedUrl) {
      throw new Error(validation.reason || "Invalid image URL");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(validation.normalizedUrl, {
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect without location header");
      }
      currentUrl = new URL(location, validation.normalizedUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to download thumbnail (HTTP ${response.status})`);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      throw new Error("URL did not return an image");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error("Image must be smaller than 10MB");
    }

    if (!response.body) {
      throw new Error("Empty response body");
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > maxBytes) {
          throw new Error("Image must be smaller than 10MB");
        }
        chunks.push(Buffer.from(value));
      }
    }

    return { buffer: Buffer.concat(chunks), contentType };
  }

  throw new Error("Too many redirects");
}

export async function POST(request: NextRequest) {
  try {
    const { image_url, name } = await request.json();

    if (!image_url || typeof image_url !== "string") {
      return NextResponse.json({ error: "image_url is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("thumbnail_preset_styles")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const existingPresets = (profile?.thumbnail_preset_styles as any[]) || [];
    if (existingPresets.length >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `You can only save up to ${MAX_PRESETS} preset styles.` },
        { status: 400 }
      );
    }

    const { buffer, contentType } = await fetchImageWithLimit(
      image_url,
      MAX_FILE_SIZE_BYTES
    );

    const presetId = crypto.randomUUID();
    const timestamp = Date.now();
    const fileExt = extFromContentType(contentType);
    const fileName = `preset_${timestamp}.${fileExt}`;
    const path = `${user.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("thumbnail-preset-styles")
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const newPreset = {
      id: presetId,
      bucket: "thumbnail-preset-styles",
      path,
      name: typeof name === "string" && name.trim().length > 0 ? name.trim() : "Preset",
      created_at: new Date().toISOString(),
    };

    const updatedPresets = [...existingPresets, newPreset];

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        thumbnail_preset_styles: updatedPresets,
      } as any)
      .eq("id", user.id);

    if (updateError) {
      await supabase.storage.from("thumbnail-preset-styles").remove([path]);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ preset: newPreset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
