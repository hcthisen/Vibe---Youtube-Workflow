import type { ToolRunContext, ToolResult } from "../registry";
import type {
  VideoUploadFinalizeInput,
  VideoUploadFinalizeOutput,
} from "../schemas";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/database.types";

type ProjectAssetRow = Database["public"]["Tables"]["project_assets"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

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
    const { data: assetData, error: assetError } = await supabase
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

    const asset = assetData as unknown as ProjectAssetRow | null;

    if (assetError || !asset) {
      return { success: false, error: assetError?.message || "Failed to create asset", logs };
    }

    logs.push(`Created asset: ${asset.id}`);

    // Get user profile for processing settings
    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "silence_threshold_ms, retake_markers, intro_transition_enabled, " +
        "retake_detection_enabled, retake_context_window_seconds, retake_min_confidence, " +
        "retake_prefer_sentence_boundaries, llm_model"
      )
      .eq("id", context.userId)
      .single();
    const profile = profileData as
      | {
          silence_threshold_ms: number;
          retake_markers: unknown;
          intro_transition_enabled: boolean;
          retake_detection_enabled: boolean;
          retake_context_window_seconds: number;
          retake_min_confidence: number;
          retake_prefer_sentence_boundaries: boolean;
          llm_model: string;
        }
      | null;

    // Create processing job
    const { data: jobData, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        project_id: input.project_id,
        type: "video_process",
        status: "queued",
        input: {
          asset_id: asset.id,
          silence_threshold_ms: profile?.silence_threshold_ms || 500,
          retake_detection_enabled: profile?.retake_detection_enabled || false,
          retake_markers: (profile?.retake_markers as any) || [],
          apply_intro_transition: profile?.intro_transition_enabled || false,
          retake_context_window_seconds: profile?.retake_context_window_seconds || 30,
          retake_min_confidence: profile?.retake_min_confidence || 0.7,
          retake_prefer_sentence_boundaries: profile?.retake_prefer_sentence_boundaries ?? true,
          llm_model: profile?.llm_model || "gpt-4.1",
        } as any,
      })
      .select()
      .single();

    const job = jobData as unknown as JobRow | null;

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
