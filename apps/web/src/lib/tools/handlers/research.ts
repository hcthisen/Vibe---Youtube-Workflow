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
import { getDataForSeoClient } from "@/lib/integrations/dataforseo";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { createServiceClient } from "@/lib/supabase/service";

export async function channelImportLatest20Handler(
  input: ChannelImportLatest20Input,
  context: ToolRunContext
): Promise<ToolResult<ChannelImportLatest20Output>> {
  const logs: string[] = [];

  try {
    logs.push(`Fetching latest 20 videos for channel: ${input.channel_identifier}`);

    const result = await getDataForSeoClient().getChannelVideos(input.channel_identifier, 20);

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
        raw_provider_payload: (video.raw_payload || {}) as any,
      }, {
        onConflict: "user_id,youtube_video_id",
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

    const keywordQueries = input.keywords.map((k) => k.trim()).filter(Boolean);
    if (keywordQueries.length === 0) {
      return { success: false, error: "At least one keyword is required", logs };
    }
    const searchPromises = keywordQueries.map((query) =>
      getDataForSeoClient().searchVideos({
        keywords: [query],
        limit: input.limit || 50,
        language_code: input.language_code,
        location_code: input.location_code,
      })
    );

    const searchResults = await Promise.all(searchPromises);
    const failedSearches = searchResults.filter((r) => !r.success);
    const allVideos = searchResults.flatMap((r) => (r.success ? r.videos : []));

    if (failedSearches.length === searchResults.length) {
      return { success: false, error: failedSearches[0]?.error || "Search failed", logs };
    }

    logs.push(
      `Ran ${keywordQueries.length} search query${keywordQueries.length === 1 ? "" : "ies"}`
    );
    logs.push(`Found ${allVideos.length} videos from DataForSEO`);

    // Check if we got any videos at all
    if (allVideos.length === 0) {
      return {
        success: false,
        error: `No videos found for keywords: ${input.keywords.join(", ")}. Try different keywords or broaden your search.`,
        logs,
      };
    }

    // Deduplicate by youtube video ID
    const uniqueByYoutubeId = new Map<string, (typeof allVideos)[number]>();
    for (const video of allVideos) {
      if (!video.youtube_video_id) continue;
      if (!uniqueByYoutubeId.has(video.youtube_video_id)) {
        uniqueByYoutubeId.set(video.youtube_video_id, video);
      }
    }

    const dedupedVideos = Array.from(uniqueByYoutubeId.values());
    logs.push(`Deduplicated to ${dedupedVideos.length} unique videos`);

    // Get user's channel baseline for scoring
    const supabase = await createServiceClient();
    const { data: channel } = await supabase
      .from("channels")
      .select("avg_views")
      .eq("user_id", context.userId)
      .single();

    const channelAvgViews = channel?.avg_views || 10000; // Default baseline
    logs.push(`Using channel baseline: ${channelAvgViews} avg views`);

    // Calculate scores
    const scoredResults = dedupedVideos.map((video) => {
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
        age_in_days: ageInDays,
      };
    });

    logs.push(`Scored ${scoredResults.length} videos`);

    // Apply filters
    let filteredResults = scoredResults;
    const initialCount = filteredResults.length;

    // Filter by min_views if specified
    if (input.min_views && input.min_views > 0) {
      filteredResults = filteredResults.filter(
        (video) => (video.views_count || 0) >= input.min_views!
      );
      const removedByViews = initialCount - filteredResults.length;
      if (removedByViews > 0) {
        logs.push(`Filtered out ${removedByViews} videos below ${input.min_views} views`);
      }
    }

    // Filter by max_age_days if specified
    if (input.max_age_days && input.max_age_days > 0) {
      const beforeAgeFilter = filteredResults.length;
      filteredResults = filteredResults.filter(
        (video) => video.age_in_days <= input.max_age_days!
      );
      const removedByAge = beforeAgeFilter - filteredResults.length;
      if (removedByAge > 0) {
        logs.push(`Filtered out ${removedByAge} videos older than ${input.max_age_days} days`);
      }
    }

    // Check if all videos were filtered out
    if (filteredResults.length === 0) {
      const filterDetails: string[] = [];
      if (input.min_views && input.min_views > 0) {
        filterDetails.push(`minimum ${input.min_views} views`);
      }
      if (input.max_age_days && input.max_age_days > 0) {
        filterDetails.push(`maximum ${input.max_age_days} days old`);
      }
      return {
        success: false,
        error: `All ${initialCount} videos were filtered out by your criteria (${filterDetails.join(", ")}). Try relaxing your filters.`,
        logs,
      };
    }

    logs.push(`${filteredResults.length} videos after filtering`);

    // Sort by score
    filteredResults.sort((a, b) => b.score - a.score);

    const maxResults = input.limit || filteredResults.length;
    const finalResults = filteredResults.slice(0, maxResults);
    if (finalResults.length < filteredResults.length) {
      logs.push(`Trimmed results to top ${finalResults.length} by score`);
    }

    // Store videos in database (remove age_in_days before storing)
    for (const video of finalResults) {
      const { age_in_days, ...videoData } = video;
      await supabase.from("videos").upsert({
        id: videoData.video_id,
        user_id: context.userId,
        source: "research",
        youtube_video_id: videoData.youtube_video_id,
        title: videoData.title,
        thumbnail_url: videoData.thumbnail_url,
        published_at: videoData.published_at,
        views_count: videoData.views_count,
        channel_name: videoData.channel_name,
      }, {
        onConflict: "user_id,youtube_video_id",
      });
    }

    logs.push(`Stored ${finalResults.length} videos in database`);

    // Remove age_in_days from final results
    const outputResults = finalResults.map(({ age_in_days, ...video }) => video);

    return {
      success: true,
      data: {
        results: outputResults,
        total_found: outputResults.length,
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

    const result = await getOpenAIClient().generateIdeas({
      baselineContext,
      baselineKeywords,
      avoidTopics: input.avoid_topics || [],
      targetViewer: input.target_viewer_description,
      focusTopic: input.focus_topic,
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

    const result = await getDataForSeoClient().getVideoSubtitles(input.youtube_video_id);

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

