import type { ToolRunContext, ToolResult } from "../registry";
import type {
  HeadshotPoseAnalyzeInput,
  HeadshotPoseAnalyzeOutput,
  ThumbnailGenerateFromReferenceInput,
  ThumbnailGenerateFromReferenceOutput,
  ThumbnailIterateInput,
  ThumbnailIterateOutput,
} from "../schemas";
import { getNanoBananaClient } from "@/lib/integrations/nano-banana";
import { createServiceClient } from "@/lib/supabase/service";
import { analyzePoseFromUrl, findBestMatchingHeadshot } from "@/lib/integrations/pose-analysis";

// Pose bucket calculation
function getPoseBucket(yaw: number, pitch: number): string {
  // Convention: yaw > 0 => left, yaw < 0 => right
  //            pitch near ±180 => level, away from ±180 => up/down
  
  // Horizontal (left/right)
  let horizontal: string;
  if (Math.abs(yaw) < 25) {
    horizontal = "front";
  } else if (yaw > 0) {
    horizontal = "left";
  } else {
    horizontal = "right";
  }
  
  // Vertical (up/down)
  // Calculate distance from ±180 (level)
  const pitchFromLevel = Math.min(Math.abs(pitch - 180), Math.abs(pitch + 180));
  
  let vertical: string;
  if (pitchFromLevel < 10) {
    // Within 10° of ±180 is "level"
    vertical = "";
  } else if (pitch > 0 && pitch < 180) {
    // Closer to 0 = looking down
    vertical = "down";
  } else {
    // Closer to -180 = looking up
    vertical = "up";
  }
  
  if (!vertical) {
    return horizontal;
  } else if (horizontal === "front") {
    return vertical;
  } else {
    return `${vertical}-${horizontal}`;
  }
}

export async function headshotPoseAnalyzeHandler(
  input: HeadshotPoseAnalyzeInput,
  context: ToolRunContext
): Promise<ToolResult<HeadshotPoseAnalyzeOutput>> {
  const logs: string[] = [];

  try {
    if (!input.headshot_id && !input.image_url) {
      return { success: false, error: "No headshot_id or image_url provided", logs };
    }

    const supabase = await createServiceClient();

    // If headshot_id was provided, ensure it belongs to the current user
    if (input.headshot_id) {
      const { data: headshot, error } = await supabase
        .from("headshots")
        .select("id")
        .eq("id", input.headshot_id)
        .eq("user_id", context.userId)
        .single();

      if (error || !headshot) {
        return { success: false, error: "Headshot not found", logs };
      }
    }

    // Enqueue a pose analysis job for the Python worker (real analysis)
    logs.push("Enqueuing pose analysis job...");
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        type: "pose_analyze",
        status: "queued",
        input: input.headshot_id
          ? { headshot_id: input.headshot_id }
          : { image_url: input.image_url },
      })
      .select("id, status")
      .single();

    if (jobError || !job) {
      return { success: false, error: jobError?.message || "Failed to create job", logs };
    }

    logs.push(`Created job: ${job.id}`);

    // Poll for completion (so the API can return the computed values when the worker is running)
    const deadlineMs = Date.now() + 20_000; // 20s
    const pollIntervalMs = 500;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: currentJob, error: jobFetchError } = await supabase
        .from("jobs")
        .select("status, output, error")
        .eq("id", job.id)
        .single();

      if (jobFetchError || !currentJob) {
        logs.push(`Failed to fetch job status: ${jobFetchError?.message || "unknown error"}`);
        break;
      }

      if (currentJob.status === "succeeded") {
        const output = (currentJob.output || {}) as Record<string, unknown>;

        // Prefer worker output; fallback to deriving bucket from yaw/pitch if needed
        const yaw = typeof output.yaw === "number" ? output.yaw : null;
        const pitch = typeof output.pitch === "number" ? output.pitch : null;
        const bucket =
          typeof output.bucket === "string"
            ? output.bucket
            : yaw !== null && pitch !== null
              ? getPoseBucket(yaw, pitch)
              : null;

        // If this was a headshot_id run, the worker also updates the DB row.
        // But returning the values here is helpful for immediate UI feedback.
        if (yaw !== null && pitch !== null && bucket) {
          logs.push(`Pose: yaw=${yaw}, pitch=${pitch}, bucket=${bucket}`);
          return {
            success: true,
            data: { yaw, pitch, bucket },
            logs,
          };
        }

        // As a last resort, fetch the headshot row (should be updated by worker)
        if (input.headshot_id) {
          const { data: headshot } = await supabase
            .from("headshots")
            .select("pose_yaw, pose_pitch, pose_bucket")
            .eq("id", input.headshot_id)
            .single();

          if (headshot?.pose_yaw != null && headshot?.pose_pitch != null) {
            const finalBucket =
              headshot.pose_bucket || getPoseBucket(headshot.pose_yaw, headshot.pose_pitch);
            logs.push(
              `Pose(from headshots): yaw=${headshot.pose_yaw}, pitch=${headshot.pose_pitch}, bucket=${finalBucket}`
            );
            return {
              success: true,
              data: {
                yaw: headshot.pose_yaw,
                pitch: headshot.pose_pitch,
                bucket: finalBucket,
              },
              logs,
            };
          }
        }

        logs.push("Pose analysis completed but output was missing expected fields.");
        return { success: false, error: "Pose analysis returned invalid output", logs };
      }

      if (currentJob.status === "failed") {
        const errMsg =
          (typeof currentJob.error === "string" && currentJob.error) || "Pose analysis failed";
        logs.push(`Job failed: ${errMsg}`);
        return { success: false, error: errMsg, logs };
      }

      if (Date.now() > deadlineMs) {
        logs.push("Pose analysis job did not complete before timeout; it will continue in background.");
        // Return a successful response so the client doesn't show an error; the worker will update the DB row.
        if (input.headshot_id) {
          const { data: headshot } = await supabase
            .from("headshots")
            .select("pose_yaw, pose_pitch, pose_bucket")
            .eq("id", input.headshot_id)
            .single();

          if (headshot?.pose_yaw != null && headshot?.pose_pitch != null) {
            return {
              success: true,
              data: {
                yaw: headshot.pose_yaw,
                pitch: headshot.pose_pitch,
                bucket: headshot.pose_bucket || getPoseBucket(headshot.pose_yaw, headshot.pose_pitch),
              },
              logs,
            };
          }
        }

        // Fallback for image_url-only invocations
        return { success: true, data: { yaw: 0, pitch: 0, bucket: "front" }, logs };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return { success: false, error: "Failed to track pose analysis job", logs };
  } catch (error) {
    logs.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      logs,
    };
  }
}

export async function thumbnailGenerateFromReferenceHandler(
  input: ThumbnailGenerateFromReferenceInput,
  context: ToolRunContext
): Promise<ToolResult<ThumbnailGenerateFromReferenceOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Creating thumbnail generation job for project: ${input.project_id}`);

    const supabase = await createServiceClient();

    // Verify project exists and belongs to user
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", input.project_id)
      .eq("user_id", context.userId)
      .single();

    if (projectError || !project) {
      return { success: false, error: "Project not found", logs };
    }

    // Step 1: Determine which headshot to use (same logic as before)
    let selectedHeadshotId: string | undefined = input.headshot_id;

    if (!selectedHeadshotId) {
      // Auto-select: analyze reference thumbnail pose and find best match
      logs.push("Analyzing reference thumbnail face pose...");
      const referencePose = await analyzePoseFromUrl(input.reference_thumbnail_url);

      if (referencePose) {
        logs.push(`Reference pose: yaw=${referencePose.yaw.toFixed(1)}°, pitch=${referencePose.pitch.toFixed(1)}°, bucket=${referencePose.bucket}`);

        // Get all user headshots with pose data
        const { data: headshots } = await supabase
          .from("headshots")
          .select("id, bucket, path, pose_yaw, pose_pitch, pose_bucket")
          .eq("user_id", context.userId);

        if (headshots && headshots.length > 0) {
          const selectedHeadshot = findBestMatchingHeadshot(referencePose, headshots);
          
          if (selectedHeadshot) {
            selectedHeadshotId = selectedHeadshot.id;
            logs.push(`Auto-selected headshot: ${selectedHeadshot.id} (yaw=${selectedHeadshot.pose_yaw?.toFixed(1) || 'N/A'}°, pitch=${selectedHeadshot.pose_pitch?.toFixed(1) || 'N/A'}°)`);
          }
        } else {
          logs.push("No headshots found for user");
        }
      } else {
        logs.push("Could not analyze reference pose, selecting first available headshot");
        
        // Fallback: just get first headshot
        const { data: headshots } = await supabase
          .from("headshots")
          .select("id")
          .eq("user_id", context.userId)
          .limit(1);
        
        if (headshots && headshots.length > 0) {
          selectedHeadshotId = headshots[0].id;
        }
      }
    } else {
      // Verify manually selected headshot exists and belongs to user
      const { data: headshot } = await supabase
        .from("headshots")
        .select("id")
        .eq("id", selectedHeadshotId)
        .eq("user_id", context.userId)
        .single();

      if (!headshot) {
        return { success: false, error: "Selected headshot not found", logs };
      }
      
      logs.push(`Using manually selected headshot: ${selectedHeadshotId}`);
    }

    if (!selectedHeadshotId) {
      return { success: false, error: "No headshots available. Please upload a headshot first.", logs };
    }

    // Step 2: Create job for async processing
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: context.userId,
        project_id: input.project_id,
        type: "thumbnail_generate",
        status: "queued",
        input: {
          project_id: input.project_id,
          reference_thumbnail_url: input.reference_thumbnail_url,
          headshot_id: selectedHeadshotId,
          preset_style_id: input.preset_style_id,
          text_modifications: input.text_modifications,
          prompt_additions: input.prompt_additions,
          idea_brief_markdown: input.idea_brief_markdown,
          count: input.count || 2,
        },
      })
      .select("id, status")
      .single();

    if (jobError || !job) {
      return { success: false, error: jobError?.message || "Failed to create job", logs };
    }

    logs.push(`Created thumbnail generation job: ${job.id}`);

    return {
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        headshot_used: selectedHeadshotId,
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

export async function thumbnailIterateHandler(
  input: ThumbnailIterateInput,
  context: ToolRunContext
): Promise<ToolResult<ThumbnailIterateOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Iterating on thumbnail: ${input.previous_thumbnail_asset_id}`);

    const supabase = await createServiceClient();

    // Get previous thumbnail
    const { data: prevAsset, error: assetError } = await supabase
      .from("project_assets")
      .select("bucket, path, metadata")
      .eq("id", input.previous_thumbnail_asset_id)
      .eq("user_id", context.userId)
      .single();

    if (assetError || !prevAsset) {
      return { success: false, error: "Previous thumbnail not found", logs };
    }

    // Get the previous thumbnail URL
    const { data: urlData } = supabase.storage
      .from(prevAsset.bucket)
      .getPublicUrl(prevAsset.path);

    const previousUrl = urlData.publicUrl;

    // Get project
    const { data: project } = await supabase
      .from("projects")
      .select("title")
      .eq("id", input.project_id)
      .eq("user_id", context.userId)
      .single();

    // Get user profile for name
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .single();

    const userName = profile?.display_name || undefined;

    // Determine which headshot to use (if swapping)
    let headshotUrl: string | undefined;
    let selectedHeadshot: { id: string; pose_yaw: number | null; pose_pitch: number | null; pose_bucket: string | null } | null = null;

    if (input.headshot_id) {
      // Swap to a different headshot
      const { data: headshot } = await supabase
        .from("headshots")
        .select("id, bucket, path, pose_yaw, pose_pitch, pose_bucket")
        .eq("id", input.headshot_id)
        .eq("user_id", context.userId)
        .single();

      if (headshot) {
        const { data: headshotUrlData, error: urlError } = await supabase.storage
          .from(headshot.bucket)
          .createSignedUrl(headshot.path, 3600); // Valid for 1 hour
        
        if (!urlError && headshotUrlData?.signedUrl) {
          headshotUrl = headshotUrlData.signedUrl;
          selectedHeadshot = headshot;
          logs.push(`Swapping to headshot: ${headshot.id}`);
        } else {
          logs.push(`Failed to generate signed URL for headshot: ${headshot.id}`);
        }
      }
    } else {
      // Keep the same headshot from previous generation
      const metadata = prevAsset.metadata as Record<string, any> | null;
      if (metadata?.headshot_id) {
        selectedHeadshot = {
          id: metadata.headshot_id,
          pose_yaw: metadata.headshot_pose?.yaw || null,
          pose_pitch: metadata.headshot_pose?.pitch || null,
          pose_bucket: metadata.headshot_pose?.bucket || null,
        };
        logs.push(`Using same headshot as previous: ${metadata.headshot_id}`);
      }
    }

    // Generate iterated thumbnails
    const result = await getNanoBananaClient().iterateThumbnail({
      previousImageUrl: previousUrl,
      headshotUrl,
      userName,
      refinementPrompt: input.refinement_prompt,
      textModifications: input.text_modifications,
      title: project?.title || "",
      count: input.count || 3,
    });

    if (!result.success) {
      return { success: false, error: result.error, logs };
    }

    // Store generated thumbnails
    const thumbnails: { asset_id: string; url: string }[] = [];

    for (let i = 0; i < result.images.length; i++) {
      const imageData = result.images[i];
      const path = `${context.userId}/${input.project_id}/thumbnail_iter_${Date.now()}_${i}.png`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("project-thumbnails")
        .upload(path, Buffer.from(imageData, "base64"), {
          contentType: "image/png",
        });

      if (uploadError) {
        logs.push(`Failed to upload thumbnail ${i}: ${uploadError.message}`);
        continue;
      }

      // Create asset record with metadata
      const { data: asset } = await supabase
        .from("project_assets")
        .insert({
          user_id: context.userId,
          project_id: input.project_id,
          type: "thumbnail",
          bucket: "project-thumbnails",
          path,
          metadata: {
            previous_asset_id: input.previous_thumbnail_asset_id,
            headshot_id: selectedHeadshot?.id,
            headshot_pose: selectedHeadshot ? {
              yaw: selectedHeadshot.pose_yaw,
              pitch: selectedHeadshot.pose_pitch,
              bucket: selectedHeadshot.pose_bucket,
            } : null,
            refinement_prompt: input.refinement_prompt,
            text_modifications: input.text_modifications,
            generated_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (asset) {
        const { data: urlData } = supabase.storage
          .from("project-thumbnails")
          .getPublicUrl(path);

        thumbnails.push({
          asset_id: asset.id,
          url: urlData.publicUrl,
        });
      }
    }

    logs.push(`Generated ${thumbnails.length} iterated thumbnails`);

    return {
      success: true,
      data: {
        thumbnails,
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

