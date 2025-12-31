import type { ToolRunContext, ToolResult } from "../registry";
import type {
  VideoUploadFinalizeInput,
  VideoUploadFinalizeOutput,
} from "../schemas";
import { createServiceClient } from "@/lib/supabase/service";

export async function videoUploadFinalizeHandler(
  input: VideoUploadFinalizeInput,
  context: ToolRunContext
): Promise<ToolResult<VideoUploadFinalizeOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Finalizing upload for project: ${input.project_id}`);

    const supabase = await createServiceClient();

    // Verify project exists and belongs to user
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.project_id)
      .eq("user_id", context.userId)
      .single();

    if (projectError || !project) {
      return { success: false, error: "Project not found", logs };
    }

    // Create asset record
    const { data: asset, error: assetError } = await supabase
      .from("project_assets")
      .insert({
        user_id: context.userId,
        project_id: input.project_id,
        type: "raw_video",
        bucket: "project-raw-videos",
        path: input.asset_path,
        metadata: {
          filename: input.filename,
          uploaded_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (assetError || !asset) {
      return { success: false, error: assetError?.message || "Failed to create asset", logs };
    }

    logs.push(`Created asset: ${asset.id}`);

    // Get user profile for processing settings
    const { data: profile } = await supabase
      .from("profiles")
      .select("silence_threshold_ms, retake_markers, intro_transition_enabled")
      .eq("id", context.userId)
      .single();

    // Create processing job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        project_id: input.project_id,
        type: "video_process",
        status: "queued",
        input: {
          asset_id: asset.id,
          silence_threshold_ms: profile?.silence_threshold_ms || 500,
          retake_markers: profile?.retake_markers || [],
          apply_intro_transition: profile?.intro_transition_enabled || false,
        },
      })
      .select()
      .single();

    if (jobError || !job) {
      return { success: false, error: jobError?.message || "Failed to create job", logs };
    }

    logs.push(`Created job: ${job.id}`);

    // Update project status
    await supabase
      .from("projects")
      .update({ status: "edit" })
      .eq("id", input.project_id);

    return {
      success: true,
      data: {
        asset_id: asset.id,
        job_id: job.id,
      },
      logs,
    };
  } catch (error) {
    logs.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      logs,
    };
  }
}

