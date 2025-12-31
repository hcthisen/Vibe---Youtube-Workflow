import { z } from "zod";
import type { ToolRunContext, ToolResult } from "../core";
import * as schemas from "./schemas";

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  version: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handler: (input: TInput, context: ToolRunContext) => Promise<ToolResult<TOutput>>;
}

// Tool registry - handlers will be set when importing from the web app
export const toolRegistry: Record<string, ToolDefinition> = {
  // Research tools
  channel_import_latest_20: {
    name: "channel_import_latest_20",
    version: "1.0.0",
    description: "Import the latest 20 videos from a YouTube channel",
    inputSchema: schemas.channelImportLatest20InputSchema,
    outputSchema: schemas.channelImportLatest20OutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  outlier_search: {
    name: "outlier_search",
    version: "1.0.0",
    description: "Search for outlier videos using DataForSEO",
    inputSchema: schemas.outlierSearchInputSchema,
    outputSchema: schemas.outlierSearchOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  deep_research: {
    name: "deep_research",
    version: "1.0.0",
    description: "Generate new video ideas using AI deep research",
    inputSchema: schemas.deepResearchInputSchema,
    outputSchema: schemas.deepResearchOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  video_subtitles_fetch: {
    name: "video_subtitles_fetch",
    version: "1.0.0",
    description: "Fetch subtitles/transcript for a YouTube video",
    inputSchema: schemas.videoSubtitlesFetchInputSchema,
    outputSchema: schemas.videoSubtitlesFetchOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  // Project tools
  project_create_from_idea: {
    name: "project_create_from_idea",
    version: "1.0.0",
    description: "Create a new project from a saved idea",
    inputSchema: schemas.projectCreateFromIdeaInputSchema,
    outputSchema: schemas.projectCreateFromIdeaOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  project_generate_outline: {
    name: "project_generate_outline",
    version: "1.0.0",
    description: "Generate a video outline for a project",
    inputSchema: schemas.projectGenerateOutlineInputSchema,
    outputSchema: schemas.projectGenerateOutlineOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  project_generate_titles: {
    name: "project_generate_titles",
    version: "1.0.0",
    description: "Generate title variants for a project",
    inputSchema: schemas.projectGenerateTitlesInputSchema,
    outputSchema: schemas.projectGenerateTitlesOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  // Media tools
  video_upload_finalize: {
    name: "video_upload_finalize",
    version: "1.0.0",
    description: "Finalize a video upload and create a processing job",
    inputSchema: schemas.videoUploadFinalizeInputSchema,
    outputSchema: schemas.videoUploadFinalizeOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  video_process_pipeline: {
    name: "video_process_pipeline",
    version: "1.0.0",
    description: "Process a video (silence removal, transitions)",
    inputSchema: schemas.videoProcessPipelineInputSchema,
    outputSchema: schemas.videoProcessPipelineOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  transcribe_video: {
    name: "transcribe_video",
    version: "1.0.0",
    description: "Transcribe a video using Whisper",
    inputSchema: schemas.transcribeVideoInputSchema,
    outputSchema: schemas.transcribeVideoOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  // Thumbnail tools
  headshot_pose_analyze: {
    name: "headshot_pose_analyze",
    version: "1.0.0",
    description: "Analyze the pose (yaw/pitch) of a headshot image",
    inputSchema: schemas.headshotPoseAnalyzeInputSchema,
    outputSchema: schemas.headshotPoseAnalyzeOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  thumbnail_generate_from_reference: {
    name: "thumbnail_generate_from_reference",
    version: "1.0.0",
    description: "Generate thumbnail variants from a reference image",
    inputSchema: schemas.thumbnailGenerateFromReferenceInputSchema,
    outputSchema: schemas.thumbnailGenerateFromReferenceOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },

  thumbnail_iterate: {
    name: "thumbnail_iterate",
    version: "1.0.0",
    description: "Iterate on a thumbnail with a refinement prompt",
    inputSchema: schemas.thumbnailIterateInputSchema,
    outputSchema: schemas.thumbnailIterateOutputSchema,
    handler: async () => ({ success: false, error: "Handler not implemented" }),
  },
};

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry[name];
}

export function listTools(): string[] {
  return Object.keys(toolRegistry);
}

export function registerHandler<T extends keyof typeof toolRegistry>(
  name: T,
  handler: (typeof toolRegistry)[T]["handler"]
): void {
  if (toolRegistry[name]) {
    toolRegistry[name].handler = handler;
  }
}

