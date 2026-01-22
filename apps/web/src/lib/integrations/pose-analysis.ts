/**
 * Pose Analysis Utility
 * 
 * Analyzes face pose (yaw, pitch) in images using the pose_analyze job
 */

import { createServiceClient } from "@/lib/supabase/service";
import { validateExternalUrl } from "@/lib/security/external-url";

export interface PoseResult {
  yaw: number;
  pitch: number;
  bucket: string;
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
}

function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  const videoId = extractYouTubeVideoId(trimmed);
  if (!videoId) return trimmed;

  // Prefer hqdefault for reliability (maxresdefault can 404 for some videos)
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Analyze face pose in an image URL
 * 
 * @param imageUrl - URL of the image to analyze
 * @param timeoutMs - Maximum time to wait for analysis (default: 20s)
 * @returns Pose data or null if failed
 */
export async function analyzePoseFromUrl(
  imageUrl: string,
  userId?: string,
  timeoutMs: number = 20000
): Promise<PoseResult | null> {
  try {
    if (!userId) {
      // We need a real user_id to satisfy the jobs.user_id foreign key.
      // Callers that don't have a user context should skip pose analysis.
      console.warn("analyzePoseFromUrl: missing userId; skipping pose analysis job creation");
      return null;
    }

    const supabase = await createServiceClient();
    const normalizedUrl = normalizeImageUrl(imageUrl);
    const validation = await validateExternalUrl(normalizedUrl);
    if (!validation.ok) {
      console.warn(`analyzePoseFromUrl: blocked image_url (${validation.reason})`);
      return null;
    }

    // Create pose analysis job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: userId,
        type: "pose_analyze",
        status: "queued",
        input: { image_url: normalizedUrl },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("Failed to create pose analysis job:", jobError);
      return null;
    }

    // Poll for completion
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 500; // 500ms

    while (Date.now() < deadline) {
      const { data: currentJob, error: fetchError } = await supabase
        .from("jobs")
        .select("status, output, error")
        .eq("id", job.id)
        .single();

      if (fetchError || !currentJob) {
        console.error("Failed to fetch job status:", fetchError);
        return null;
      }

      if (currentJob.status === "succeeded") {
        const output = (currentJob.output || {}) as Record<string, unknown>;
        const yaw = typeof output.yaw === "number" ? output.yaw : null;
        const pitch = typeof output.pitch === "number" ? output.pitch : null;
        const bucket = typeof output.bucket === "string" ? output.bucket : null;

        if (yaw !== null && pitch !== null && bucket) {
          return { yaw, pitch, bucket };
        }

        console.error("Invalid pose analysis output:", output);
        return null;
      }

      if (currentJob.status === "failed") {
        console.error("Pose analysis job failed:", currentJob.error);
        return null;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    console.error("Pose analysis timed out");
    return null;
  } catch (error) {
    console.error("Error analyzing pose:", error);
    return null;
  }
}

/**
 * Get pose bucket from yaw and pitch angles
 * 
 * Buckets: front, left, right, left-up, right-up, left-down, right-down, up, down
 */
export function getPoseBucket(yaw: number, pitch: number): string {
  const yawThreshold = 15; // degrees
  const pitchThreshold = 15; // degrees

  const horizontal =
    Math.abs(yaw) < yawThreshold
      ? ""
      : yaw < 0
        ? "left"
        : "right";

  const vertical =
    Math.abs(pitch) < pitchThreshold
      ? ""
      : pitch > 0
        ? "up"
        : "down";

  if (!horizontal && !vertical) {
    return "front";
  } else if (!horizontal) {
    return vertical;
  } else if (!vertical) {
    return horizontal;
  } else {
    return `${horizontal}-${vertical}`;
  }
}

/**
 * Calculate Euclidean distance between two poses
 */
export function calculatePoseDistance(
  pose1: { yaw: number; pitch: number },
  pose2: { yaw: number; pitch: number }
): number {
  return Math.sqrt(
    Math.pow(pose1.yaw - pose2.yaw, 2) + Math.pow(pose1.pitch - pose2.pitch, 2)
  );
}

/**
 * Find the best matching headshot for a target pose
 * 
 * @param targetPose - The pose to match
 * @param headshots - Array of headshots with pose data
 * @returns The best matching headshot or null
 */
export function findBestMatchingHeadshot<T extends { pose_yaw: number | null; pose_pitch: number | null }>(
  targetPose: { yaw: number; pitch: number },
  headshots: T[]
): T | null {
  if (headshots.length === 0) {
    return null;
  }

  // Filter headshots with valid pose data
  const headshotsWithPose = headshots.filter(
    (h) => h.pose_yaw !== null && h.pose_pitch !== null
  );

  if (headshotsWithPose.length === 0) {
    // Return first headshot if none have pose data
    return headshots[0];
  }

  // Find closest match by Euclidean distance
  let bestMatch = headshotsWithPose[0];
  let bestDistance = calculatePoseDistance(
    targetPose,
    { yaw: bestMatch.pose_yaw!, pitch: bestMatch.pose_pitch! }
  );

  for (const headshot of headshotsWithPose.slice(1)) {
    const distance = calculatePoseDistance(
      targetPose,
      { yaw: headshot.pose_yaw!, pitch: headshot.pose_pitch! }
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = headshot;
    }
  }

  return bestMatch;
}

