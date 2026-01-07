import { z } from "zod";
import * as schemas from "./schemas";
import * as handlers from "./handlers";

export type ToolStatus = "started" | "succeeded" | "failed";

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

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  version: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handler(input: TInput, context: ToolRunContext): Promise<ToolResult<TOutput>>;
}

// Tool registry with handlers
export const toolRegistry: Record<string, ToolDefinition> = {
  // Research tools
  channel_import_latest_20: {
    name: "channel_import_latest_20",
    version: "1.0.0",
    description: "Import the latest 20 videos from a YouTube channel",
    inputSchema: schemas.channelImportLatest20InputSchema,
    outputSchema: schemas.channelImportLatest20OutputSchema,
    handler: handlers.channelImportLatest20Handler,
  },

  outlier_search: {
    name: "outlier_search",
    version: "1.0.0",
    description: "Search for outlier videos using DataForSEO",
    inputSchema: schemas.outlierSearchInputSchema,
    outputSchema: schemas.outlierSearchOutputSchema,
    handler: handlers.outlierSearchHandler,
  },

  deep_research: {
    name: "deep_research",
    version: "1.0.0",
    description: "Generate new video ideas using AI deep research",
    inputSchema: schemas.deepResearchInputSchema,
    outputSchema: schemas.deepResearchOutputSchema,
    handler: handlers.deepResearchHandler,
  },

  idea_enrich: {
    name: "idea_enrich",
    version: "1.0.0",
    description: "Enrich a saved idea with transcript + adapted hooks/summary",
    inputSchema: schemas.ideaEnrichInputSchema,
    outputSchema: schemas.ideaEnrichOutputSchema,
    handler: handlers.ideaEnrichHandler,
  },

  video_subtitles_fetch: {
    name: "video_subtitles_fetch",
    version: "1.0.0",
    description: "Fetch subtitles/transcript for a YouTube video",
    inputSchema: schemas.videoSubtitlesFetchInputSchema,
    outputSchema: schemas.videoSubtitlesFetchOutputSchema,
    handler: handlers.videoSubtitlesFetchHandler,
  },

  // Project tools
  project_create_from_idea: {
    name: "project_create_from_idea",
    version: "1.0.0",
    description: "Create a new project from a saved idea",
    inputSchema: schemas.projectCreateFromIdeaInputSchema,
    outputSchema: schemas.projectCreateFromIdeaOutputSchema,
    handler: handlers.projectCreateFromIdeaHandler,
  },

  project_generate_outline: {
    name: "project_generate_outline",
    version: "1.0.0",
    description: "Generate a video outline for a project",
    inputSchema: schemas.projectGenerateOutlineInputSchema,
    outputSchema: schemas.projectGenerateOutlineOutputSchema,
    handler: handlers.projectGenerateOutlineHandler,
  },

  project_generate_titles: {
    name: "project_generate_titles",
    version: "1.0.0",
    description: "Generate title variants for a project",
    inputSchema: schemas.projectGenerateTitlesInputSchema,
    outputSchema: schemas.projectGenerateTitlesOutputSchema,
    handler: handlers.projectGenerateTitlesHandler,
  },

  // Media tools
  video_upload_finalize: {
    name: "video_upload_finalize",
    version: "1.0.0",
    description: "Finalize a video upload and create a processing job",
    inputSchema: schemas.videoUploadFinalizeInputSchema,
    outputSchema: schemas.videoUploadFinalizeOutputSchema,
    handler: handlers.videoUploadFinalizeHandler,
  },

  // Thumbnail tools
  headshot_pose_analyze: {
    name: "headshot_pose_analyze",
    version: "1.0.0",
    description: "Analyze the pose (yaw/pitch) of a headshot image",
    inputSchema: schemas.headshotPoseAnalyzeInputSchema,
    outputSchema: schemas.headshotPoseAnalyzeOutputSchema,
    handler: handlers.headshotPoseAnalyzeHandler,
  },

  thumbnail_generate_from_reference: {
    name: "thumbnail_generate_from_reference",
    version: "1.0.0",
    description: "Generate thumbnail variants from a reference image",
    inputSchema: schemas.thumbnailGenerateFromReferenceInputSchema,
    outputSchema: schemas.thumbnailGenerateFromReferenceOutputSchema,
    handler: handlers.thumbnailGenerateFromReferenceHandler,
  },

  thumbnail_iterate: {
    name: "thumbnail_iterate",
    version: "1.0.0",
    description: "Iterate on a thumbnail with a refinement prompt",
    inputSchema: schemas.thumbnailIterateInputSchema,
    outputSchema: schemas.thumbnailIterateOutputSchema,
    handler: handlers.thumbnailIterateHandler,
  },
};

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry[name];
}

export function listTools(): string[] {
  return Object.keys(toolRegistry);
}

