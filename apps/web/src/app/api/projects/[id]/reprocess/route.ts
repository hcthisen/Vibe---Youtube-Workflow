import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

type ProjectAssetRow = Database["public"]["Tables"]["project_assets"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify project belongs to user
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Find the raw video asset
    const { data: assetsData, error: assetsError } = await supabase
      .from("project_assets")
      .select("*")
      .eq("project_id", projectId)
      .eq("type", "raw_video")
      .order("created_at", { ascending: false })
      .limit(1);

    const assets = assetsData as unknown as ProjectAssetRow[] | null;

    if (assetsError || !assets || assets.length === 0) {
      return NextResponse.json(
        { error: "No raw video found to reprocess" },
        { status: 400 }
      );
    }

    const rawAsset = assets[0];

    // Get user profile for current processing settings
    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "silence_threshold_ms, retake_markers, intro_transition_enabled, " +
        "retake_detection_enabled, retake_context_window_seconds, retake_min_confidence, " +
        "retake_prefer_sentence_boundaries, llm_model"
      )
      .eq("id", user.id)
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

    // Create new processing job with current settings
    const { data: jobData, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        project_id: projectId,
        type: "video_process",
        status: "queued",
        input: {
          asset_id: rawAsset.id,
          silence_threshold_ms: profile?.silence_threshold_ms || 500,
          retake_detection_enabled: profile?.retake_detection_enabled || false,
          retake_markers: (profile?.retake_markers as any) || [],
          apply_intro_transition: profile?.intro_transition_enabled || false,
          retake_context_window_seconds: profile?.retake_context_window_seconds || 30,
          retake_min_confidence: profile?.retake_min_confidence || 0.7,
          retake_prefer_sentence_boundaries: profile?.retake_prefer_sentence_boundaries ?? true,
          llm_model: profile?.llm_model || "gpt-4",
        } as any,
      })
      .select()
      .single();

    const job = jobData as unknown as JobRow | null;

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || "Failed to create reprocessing job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
      message: "Reprocessing job created successfully",
    });
  } catch (error) {
    console.error("Reprocess error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

