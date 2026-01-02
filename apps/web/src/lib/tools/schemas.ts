// Re-export from packages for use in the web app
// This file mirrors packages/tools/schemas.ts

import { z } from "zod";

// ============================================================================
// RESEARCH TOOLS
// ============================================================================

export const channelImportLatest20InputSchema = z.object({
  channel_identifier: z.string().min(1, "Channel identifier is required"),
});

export const channelImportLatest20OutputSchema = z.object({
  videos: z.array(
    z.object({
      youtube_video_id: z.string(),
      title: z.string(),
      thumbnail_url: z.string().nullable(),
      published_at: z.string().nullable(),
      views_count: z.number().nullable(),
    })
  ),
  channel_name: z.string().nullable(),
});

export const outlierSearchInputSchema = z.object({
  keywords: z.array(z.string()).min(1, "At least one keyword is required"),
  search_type: z.enum(["within_niche", "cross_niche"]).default("within_niche"),
  min_views: z.number().optional(),
  max_age_days: z.number().optional().default(365),
  limit: z.number().optional().default(50),
  language_code: z.string().optional(),
  location_code: z.number().optional(),
});

export const outlierSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      video_id: z.string(),
      youtube_video_id: z.string(),
      title: z.string(),
      thumbnail_url: z.string().nullable(),
      channel_name: z.string().nullable(),
      published_at: z.string().nullable(),
      views_count: z.number().nullable(),
      score: z.number(),
      score_breakdown: z.object({
        base_outlier: z.number(),
        recency_boost: z.number(),
        modifiers: z.record(z.number()),
        modifiers_sum: z.number(),
        final_score: z.number(),
      }),
    })
  ),
  total_found: z.number(),
});

export const deepResearchInputSchema = z.object({
  avoid_topics: z.array(z.string()).optional().default([]),
  target_viewer_description: z.string().optional(),
  idea_count: z.number().optional().default(20),
});

export const deepResearchOutputSchema = z.object({
  ideas: z.array(
    z.object({
      title_concept: z.string(),
      thesis: z.string(),
      why_now: z.string(),
      hook_options: z.array(z.string()),
      thumbnail_text_ideas: z.array(z.string()),
      search_queries_used: z.array(z.string()),
    })
  ),
});

export const videoSubtitlesFetchInputSchema = z.object({
  youtube_video_id: z.string(),
});

export const videoSubtitlesFetchOutputSchema = z.object({
  available: z.boolean(),
  transcript: z.string().nullable(),
  language: z.string().nullable(),
});

// ============================================================================
// PROJECT TOOLS
// ============================================================================

export const projectCreateFromIdeaInputSchema = z.object({
  idea_id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
});

export const projectCreateFromIdeaOutputSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string(),
  status: z.string(),
});

export const projectGenerateOutlineInputSchema = z.object({
  project_id: z.string().uuid(),
  context: z.string().optional(),
});

export const projectGenerateOutlineOutputSchema = z.object({
  outline: z.object({
    intro: z.object({
      title: z.string(),
      beats: z.array(z.string()),
      duration_estimate_seconds: z.number().optional(),
    }),
    sections: z.array(
      z.object({
        title: z.string(),
        beats: z.array(z.string()),
        duration_estimate_seconds: z.number().optional(),
      })
    ),
    outro: z.object({
      title: z.string(),
      beats: z.array(z.string()),
      duration_estimate_seconds: z.number().optional(),
    }),
  }),
});

export const projectGenerateTitlesInputSchema = z.object({
  project_id: z.string().uuid(),
  count: z.number().optional().default(10),
});

export const projectGenerateTitlesOutputSchema = z.object({
  title_variants: z.array(
    z.object({
      title: z.string(),
      style: z.string(),
      reasoning: z.string().optional(),
    })
  ),
});

// ============================================================================
// MEDIA TOOLS
// ============================================================================

export const videoUploadFinalizeInputSchema = z.object({
  project_id: z.string().uuid(),
  asset_path: z.string(),
  filename: z.string(),
});

export const videoUploadFinalizeOutputSchema = z.object({
  asset_id: z.string().uuid(),
  job_id: z.string().uuid(),
});

export const videoProcessPipelineInputSchema = z.object({
  job_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  silence_threshold_ms: z.number().default(500),
  retake_markers: z.array(z.string()).default([]),
  apply_intro_transition: z.boolean().default(false),
});

export const videoProcessPipelineOutputSchema = z.object({
  processed_asset_id: z.string().uuid(),
  transcript_asset_id: z.string().uuid(),
  edit_report_asset_id: z.string().uuid(),
  edit_report: z.object({
    original_duration_ms: z.number(),
    processed_duration_ms: z.number(),
    total_silence_removed_ms: z.number(),
    cuts_count: z.number(),
  }),
});

export const transcribeVideoInputSchema = z.object({
  job_id: z.string().uuid(),
  asset_id: z.string().uuid(),
});

export const transcribeVideoOutputSchema = z.object({
  transcript_asset_id: z.string().uuid(),
  language: z.string(),
  duration_ms: z.number(),
});

// ============================================================================
// THUMBNAIL TOOLS
// ============================================================================

export const headshotPoseAnalyzeInputSchema = z.object({
  headshot_id: z.string().uuid().optional(),
  image_url: z.string().optional(),
});

export const headshotPoseAnalyzeOutputSchema = z.object({
  yaw: z.number(),
  pitch: z.number(),
  bucket: z.string(),
});

export const thumbnailGenerateFromReferenceInputSchema = z.object({
  project_id: z.string().uuid(),
  reference_thumbnail_url: z.string().url(),
  headshot_id: z.string().uuid().optional(), // Optional manual override
  preset_style_id: z.string().uuid().optional(), // Optional preset style to use as reference
  text_modifications: z.string().optional(), // Optional text changes
  prompt_additions: z.string().optional(),
  idea_brief_markdown: z.string().optional(), // Optional idea brief for context
  count: z.number().min(1).max(4).optional().default(2), // 1-4 thumbnails, default 2
});

export const thumbnailGenerateFromReferenceOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.string(),
  headshot_used: z.string().uuid(), // Which headshot was used
});

export const thumbnailIterateInputSchema = z.object({
  project_id: z.string().uuid(),
  previous_thumbnail_asset_id: z.string().uuid(),
  headshot_id: z.string().uuid().optional(), // Optional: swap to different headshot
  text_modifications: z.string().optional(), // Optional text changes
  refinement_prompt: z.string(),
  idea_brief_markdown: z.string().optional(), // Optional idea brief for context
  count: z.number().min(1).max(4).optional().default(2), // 1-4 thumbnails, default 2
});

export const thumbnailIterateOutputSchema = z.object({
  thumbnails: z.array(
    z.object({
      asset_id: z.string().uuid(),
      url: z.string(),
    })
  ),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ChannelImportLatest20Input = z.infer<typeof channelImportLatest20InputSchema>;
export type ChannelImportLatest20Output = z.infer<typeof channelImportLatest20OutputSchema>;
export type OutlierSearchInput = z.infer<typeof outlierSearchInputSchema>;
export type OutlierSearchOutput = z.infer<typeof outlierSearchOutputSchema>;
export type DeepResearchInput = z.infer<typeof deepResearchInputSchema>;
export type DeepResearchOutput = z.infer<typeof deepResearchOutputSchema>;
export type VideoSubtitlesFetchInput = z.infer<typeof videoSubtitlesFetchInputSchema>;
export type VideoSubtitlesFetchOutput = z.infer<typeof videoSubtitlesFetchOutputSchema>;
export type ProjectCreateFromIdeaInput = z.infer<typeof projectCreateFromIdeaInputSchema>;
export type ProjectCreateFromIdeaOutput = z.infer<typeof projectCreateFromIdeaOutputSchema>;
export type ProjectGenerateOutlineInput = z.infer<typeof projectGenerateOutlineInputSchema>;
export type ProjectGenerateOutlineOutput = z.infer<typeof projectGenerateOutlineOutputSchema>;
export type ProjectGenerateTitlesInput = z.infer<typeof projectGenerateTitlesInputSchema>;
export type ProjectGenerateTitlesOutput = z.infer<typeof projectGenerateTitlesOutputSchema>;
export type VideoUploadFinalizeInput = z.infer<typeof videoUploadFinalizeInputSchema>;
export type VideoUploadFinalizeOutput = z.infer<typeof videoUploadFinalizeOutputSchema>;
export type VideoProcessPipelineInput = z.infer<typeof videoProcessPipelineInputSchema>;
export type VideoProcessPipelineOutput = z.infer<typeof videoProcessPipelineOutputSchema>;
export type TranscribeVideoInput = z.infer<typeof transcribeVideoInputSchema>;
export type TranscribeVideoOutput = z.infer<typeof transcribeVideoOutputSchema>;
export type HeadshotPoseAnalyzeInput = z.infer<typeof headshotPoseAnalyzeInputSchema>;
export type HeadshotPoseAnalyzeOutput = z.infer<typeof headshotPoseAnalyzeOutputSchema>;
export type ThumbnailGenerateFromReferenceInput = z.infer<typeof thumbnailGenerateFromReferenceInputSchema>;
export type ThumbnailGenerateFromReferenceOutput = z.infer<typeof thumbnailGenerateFromReferenceOutputSchema>;
export type ThumbnailIterateInput = z.infer<typeof thumbnailIterateInputSchema>;
export type ThumbnailIterateOutput = z.infer<typeof thumbnailIterateOutputSchema>;

