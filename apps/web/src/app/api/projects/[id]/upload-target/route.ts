import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_VIDEO_FILE_SIZE_BYTES,
  RAW_VIDEO_BUCKET,
} from "@/lib/storage/constants";
import {
  ensureRawVideoBucketReady,
} from "@/lib/storage/buckets";

function inferExtension(filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop() ?? "" : "";
  const normalized = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || "mp4";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json().catch(() => null);
    const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
    const contentType =
      typeof body?.contentType === "string" ? body.contentType.trim() : "";
    const fileSize =
      typeof body?.fileSize === "number" && Number.isFinite(body.fileSize)
        ? body.fileSize
        : NaN;

    if (!filename) {
      return NextResponse.json({ success: false, error: "filename is required" }, { status: 400 });
    }

    if (!contentType.startsWith("video/")) {
      return NextResponse.json(
        { success: false, error: "Only video files are accepted" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, error: "fileSize is required" }, { status: 400 });
    }

    if (fileSize > MAX_VIDEO_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large (max 2GB)" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    await ensureRawVideoBucketReady();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error("Supabase URL not configured");
    }

    const filePath = `${user.id}/${projectId}/${Date.now()}.${inferExtension(filename)}`;

    return NextResponse.json({
      success: true,
      data: {
        bucketName: RAW_VIDEO_BUCKET,
        filePath,
        uploadUrl: `${supabaseUrl}/storage/v1/upload/resumable`,
        maxFileSizeBytes: MAX_VIDEO_FILE_SIZE_BYTES,
      },
    });
  } catch (error) {
    console.error("Upload target error:", error);

    const message = error instanceof Error ? error.message : "Failed to prepare upload";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
