// Core shared types for YouTube Production Assistant

export type ToolStatus = "started" | "succeeded" | "failed";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type JobType = "video_process" | "transcribe" | "thumbnail_generate" | "pose_analyze" | "research_run";
export type IdeaStatus = "new" | "saved" | "discarded";
export type ProjectStatus = "research" | "outline" | "record" | "edit" | "thumbnail" | "done";
export type VideoSource = "channel_import" | "research";
export type AssetType = "raw_video" | "processed_video" | "transcript" | "edit_report" | "thumbnail" | "headshot";

export interface ToolRunContext {
  userId: string;
  toolName: string;
  toolVersion: string;
  runId: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  logs?: string[];
}

export interface ScoreBreakdown {
  base_outlier: number;
  recency_boost: number;
  modifiers: Record<string, number>;
  modifiers_sum: number;
  final_score: number;
}

export interface OutlineSection {
  title: string;
  beats: string[];
  duration_estimate_seconds?: number;
}

export interface Outline {
  intro: OutlineSection;
  sections: OutlineSection[];
  outro: OutlineSection;
}

export interface HookOption {
  text: string;
  style: "question" | "statement" | "story" | "statistic";
}

export interface EditReport {
  original_duration_ms: number;
  processed_duration_ms: number;
  total_silence_removed_ms: number;
  cuts: Array<{
    start_ms: number;
    end_ms: number;
    duration_ms: number;
    reason: string;
  }>;
}

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  confidence?: number;
}

export interface Transcript {
  segments: TranscriptSegment[];
  full_text: string;
  language: string;
}

export interface PoseAnalysis {
  yaw: number; // -90 to 90, negative = left, positive = right
  pitch: number; // -90 to 90, negative = down, positive = up
  bucket: string; // "front" | "left" | "right" | "up-left" | "up-right" | "down-left" | "down-right"
}

export const POSE_BUCKETS = {
  front: { yaw: [-15, 15], pitch: [-15, 15] },
  left: { yaw: [-90, -15], pitch: [-15, 15] },
  right: { yaw: [15, 90], pitch: [-15, 15] },
  "up-left": { yaw: [-90, -15], pitch: [15, 90] },
  "up-right": { yaw: [15, 90], pitch: [15, 90] },
  "down-left": { yaw: [-90, -15], pitch: [-90, -15] },
  "down-right": { yaw: [15, 90], pitch: [-90, -15] },
  up: { yaw: [-15, 15], pitch: [15, 90] },
  down: { yaw: [-15, 15], pitch: [-90, -15] },
} as const;

export function getPoseBucket(yaw: number, pitch: number): string {
  for (const [bucket, ranges] of Object.entries(POSE_BUCKETS)) {
    const [yawMin, yawMax] = ranges.yaw;
    const [pitchMin, pitchMax] = ranges.pitch;
    if (yaw >= yawMin && yaw <= yawMax && pitch >= pitchMin && pitch <= pitchMax) {
      return bucket;
    }
  }
  return "front"; // default
}

