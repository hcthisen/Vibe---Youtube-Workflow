import type { ToolRunContext, ToolResult } from "../registry";
import type {
  ChannelImportLatest20Input,
  ChannelImportLatest20Output,
  OutlierSearchInput,
  OutlierSearchOutput,
  DeepResearchInput,
  DeepResearchOutput,
  VideoSubtitlesFetchInput,
  VideoSubtitlesFetchOutput,
} from "../schemas";
import { dataForSeoClient } from "@/lib/integrations/dataforseo";
import { openaiClient } from "@/lib/integrations/openai";
import { createServiceClient } from "@/lib/supabase/service";

export async function channelImportLatest20Handler(
  input: ChannelImportLatest20Input,
  context: ToolRunContext
): Promise<ToolResult<ChannelImportLatest20Output>> {
  const logs: string[] = [];

  try {
    logs.push(`Fetching latest 20 videos for channel: ${input.channel_identifier}`);

    const result = await dataForSeoClient.getChannelVideos(input.channel_identifier, 20);

    if (!result.success) {
      return { success: false, error: result.error, logs };
    }

    logs.push(`Found ${result.videos.length} videos`);

    // Store videos in database
    const supabase = await createServiceClient();
    
    for (const video of result.videos) {
      await supabase.from("videos").upsert({
        user_id: context.userId,
        source: "channel_import",
        youtube_video_id: video.youtube_video_id,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        published_at: video.published_at,
        views_count: video.views_count,
        channel_name: result.channel_name,
        raw_provider_payload: video.raw_payload || {},
      }, {
        onConflict: "youtube_video_id",
      });
    }

    logs.push(`Stored ${result.videos.length} videos in database`);

    return {
      success: true,
      data: {
        videos: result.videos,
        channel_name: result.channel_name,
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

export async function outlierSearchHandler(
  input: OutlierSearchInput,
  context: ToolRunContext
): Promise<ToolResult<OutlierSearchOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Searching for outliers with keywords: ${input.keywords.join(", ")}`);

    const result = await dataForSeoClient.searchVideos({
      keywords: input.keywords,
      limit: input.limit || 50,
      language_code: input.language_code,
      location_code: input.location_code,
    });

    if (!result.success) {
      return { success: false, error: result.error, logs };
    }

    logs.push(`Found ${result.videos.length} videos`);

    // Get user's channel baseline for scoring
    const supabase = await createServiceClient();
    const { data: channel } = await supabase
      .from("channels")
      .select("avg_views")
      .eq("user_id", context.userId)
      .single();

    const channelAvgViews = channel?.avg_views || 10000; // Default baseline

    // Calculate scores
    const scoredResults = result.videos.map((video) => {
      const views = video.views_count || 0;
      const publishedAt = video.published_at ? new Date(video.published_at) : new Date();
      const ageInDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

      // Base outlier score
      const baseOutlier = views / channelAvgViews;

      // Recency boost (newer videos get higher boost)
      const recencyBoost = Math.max(0.5, 2 - ageInDays / 180);

      // Keyword modifiers
      const modifiers: Record<string, number> = {};
      let modifiersSum = 0;

      // Check for power words in title
      const powerWords = ["secret", "never", "shocking", "revealed", "truth", "why", "how"];
      for (const word of powerWords) {
        if (video.title.toLowerCase().includes(word)) {
          modifiers[word] = 0.1;
          modifiersSum += 0.1;
        }
      }

      const finalScore = baseOutlier * recencyBoost * (1 + modifiersSum);

      return {
        video_id: crypto.randomUUID(),
        youtube_video_id: video.youtube_video_id,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        channel_name: video.channel_name,
        published_at: video.published_at,
        views_count: video.views_count,
        score: finalScore,
        score_breakdown: {
          base_outlier: baseOutlier,
          recency_boost: recencyBoost,
          modifiers,
          modifiers_sum: modifiersSum,
          final_score: finalScore,
        },
      };
    });

    // Sort by score
    scoredResults.sort((a, b) => b.score - a.score);

    // Store videos in database
    for (const video of scoredResults) {
      await supabase.from("videos").upsert({
        id: video.video_id,
        user_id: context.userId,
        source: "research",
        youtube_video_id: video.youtube_video_id,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        published_at: video.published_at,
        views_count: video.views_count,
        channel_name: video.channel_name,
      }, {
        onConflict: "youtube_video_id",
      });
    }

    logs.push(`Scored and stored ${scoredResults.length} videos`);

    return {
      success: true,
      data: {
        results: scoredResults,
        total_found: scoredResults.length,
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

export async function deepResearchHandler(
  input: DeepResearchInput,
  context: ToolRunContext
): Promise<ToolResult<DeepResearchOutput>> {
  const logs: string[] = [];

  try {
    logs.push("Starting deep research...");

    // Get user's baseline context
    const supabase = await createServiceClient();
    const { data: channel } = await supabase
      .from("channels")
      .select("baseline_summary, baseline_keywords")
      .eq("user_id", context.userId)
      .single();

    const baselineContext = channel?.baseline_summary || "";
    const baselineKeywords = (channel?.baseline_keywords as string[]) || [];

    logs.push(`Using baseline context: ${baselineContext.slice(0, 100)}...`);

    const result = await openaiClient.generateIdeas({
      baselineContext,
      baselineKeywords,
      avoidTopics: input.avoid_topics || [],
      targetViewer: input.target_viewer_description,
      count: input.idea_count || 20,
    });

    if (!result.success) {
      return { success: false, error: result.error, logs };
    }

    logs.push(`Generated ${result.ideas.length} ideas`);

    return {
      success: true,
      data: {
        ideas: result.ideas,
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

export async function videoSubtitlesFetchHandler(
  input: VideoSubtitlesFetchInput,
  context: ToolRunContext
): Promise<ToolResult<VideoSubtitlesFetchOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Fetching subtitles for video: ${input.youtube_video_id}`);

    const result = await dataForSeoClient.getVideoSubtitles(input.youtube_video_id);

    if (!result.success) {
      return {
        success: true,
        data: {
          available: false,
          transcript: null,
          language: null,
        },
        logs,
      };
    }

    logs.push(`Fetched subtitles in ${result.language}`);

    return {
      success: true,
      data: {
        available: true,
        transcript: result.transcript,
        language: result.language,
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

