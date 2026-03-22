import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";
import type { Database } from "@/lib/database.types";

type ProjectAssetRow = Database["public"]["Tables"]["project_assets"]["Row"];

/**
 * POST /api/v1/projects/[id]/reprocess — Reprocess the raw video with current settings
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
      .select("id, language_code")
      .eq("id", id)
      .eq("user_id", auth.userId)
      .single();

    if (!project) return errorResponse("Project not found", 404);

    // Find raw video
    const { data: assetsData } = await supabase
      .from("project_assets")
      .select("*")
      .eq("project_id", id)
      .eq("type", "raw_video")
      .order("created_at", { ascending: false })
      .limit(1);

    const assets = assetsData as unknown as ProjectAssetRow[] | null;
    if (!assets || assets.length === 0) {
      return errorResponse("No raw video found to reprocess");
    }

    // Get profile settings
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "silence_threshold_ms, retake_markers, intro_transition_enabled, audio_target_lufs, " +
        "retake_detection_enabled, retake_context_window_seconds, retake_min_confidence, " +
        "retake_prefer_sentence_boundaries"
      )
      .eq("id", auth.userId)
      .single();

    const p = profile as Record<string, unknown> | null;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: auth.userId,
        project_id: id,
        type: "video_process",
        status: "queued",
        input: {
          asset_id: assets[0].id,
          silence_threshold_ms: p?.silence_threshold_ms || 500,
          retake_detection_enabled: p?.retake_detection_enabled || false,
          retake_markers: (p?.retake_markers as unknown) || [],
          apply_intro_transition: p?.intro_transition_enabled || false,
          audio_target_lufs: p?.audio_target_lufs ?? -15.0,
          language_code: project.language_code,
          retake_context_window_seconds: p?.retake_context_window_seconds || 30,
          retake_min_confidence: p?.retake_min_confidence || 0.7,
          retake_prefer_sentence_boundaries: p?.retake_prefer_sentence_boundaries ?? true,
        } as any,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return errorResponse(jobError?.message || "Failed to create reprocessing job", 500);
    }

    return successResponse({
      job_id: job.id,
      message: "Reprocessing job created. Poll /api/v1/jobs/{job_id} for status.",
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
