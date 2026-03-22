import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

/**
 * POST /api/v1/projects/[id]/upload — Upload a video file directly
 * Expects multipart form data with a "file" field.
 * After upload, automatically triggers video processing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();

    // Verify ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!project) return errorResponse("Project not found", 404);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) return errorResponse("file is required (multipart form data)");
    if (file.size > MAX_FILE_SIZE) return errorResponse("File too large (max 2GB)");
    if (!file.type.startsWith("video/")) {
      return errorResponse("Only video files are accepted");
    }

    const filename = file.name || "upload.mp4";
    const storagePath = `${auth.userId}/${id}/${Date.now()}_${filename}`;

    // Upload to Supabase storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("project-raw-videos")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) return errorResponse(`Upload failed: ${uploadError.message}`, 500);

    // Finalize via the tool system (creates asset record + processing job)
    const { executeTool } = await import("@/lib/tools/executor");
    const result = await executeTool({
      userId: auth.userId,
      toolName: "video_upload_finalize",
      input: {
        project_id: id,
        asset_path: storagePath,
        filename,
      },
    });

    if (!result.success) {
      return errorResponse(result.error || "Upload succeeded but finalization failed", 500);
    }

    return successResponse({
      ...(result.data as object),
      message: "Video uploaded and processing started. Poll /api/v1/jobs/{job_id} for status.",
    }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
