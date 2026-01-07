import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const MAX_PRESETS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function extFromContentType(contentType: string): string {
  if (contentType.includes("image/jpeg")) return "jpg";
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/gif")) return "gif";
  return "jpg";
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

    const imageResponse = await fetch(image_url);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download thumbnail (HTTP ${imageResponse.status})` },
        { status: 400 }
      );
    }

    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "URL did not return an image" }, { status: 400 });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image must be smaller than 10MB" },
        { status: 400 }
      );
    }

    const presetId = crypto.randomUUID();
    const timestamp = Date.now();
    const fileExt = extFromContentType(contentType);
    const fileName = `preset_${timestamp}.${fileExt}`;
    const path = `${user.id}/${fileName}`;
    const buffer = Buffer.from(arrayBuffer);

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
