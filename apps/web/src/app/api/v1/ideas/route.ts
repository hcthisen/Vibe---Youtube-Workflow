import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/ideas — List all saved ideas
 * Query params: search_result_id? (filter by search), status? (filter by status)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();
    const searchParams = request.nextUrl.searchParams;
    const searchResultId = searchParams.get("search_result_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("ideas")
      .select("*, videos!ideas_source_video_id_fkey(title, youtube_video_id, thumbnail_url, channel_name, views_count)")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (searchResultId) query = query.eq("search_result_id", searchResultId);
    if (status) query = query.eq("status", status);

    const { data: ideas, error } = await query;

    if (error) {
      // Fallback without join if FK doesn't exist
      const { data: ideasSimple, error: err2 } = await supabase
        .from("ideas")
        .select("*")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false });

      if (err2) return errorResponse(err2.message, 500);
      return successResponse({ ideas: ideasSimple || [] });
    }

    return successResponse({ ideas: ideas || [] });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * POST /api/v1/ideas — Save an idea from search results
 * Body: { video_id, score?, score_breakdown?, search_result_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const { video_id, score, score_breakdown, search_result_id } = await request.json();
    if (!video_id) return errorResponse("video_id is required");

    const supabase = getApiSupabase();

    // Check if video exists
    let videoResult = await supabase
      .from("videos")
      .select("id, youtube_video_id, title, thumbnail_url, channel_name, published_at, views_count")
      .eq("id", video_id)
      .eq("user_id", auth.userId)
      .single();
    let video = videoResult.data;

    // If not found and search_result_id given, try to create from search results
    if (!video && search_result_id) {
      const { data: searchResult } = await supabase
        .from("search_results")
        .select("id, results")
        .eq("id", search_result_id)
        .eq("user_id", auth.userId)
        .single();

      if (searchResult) {
        const results = Array.isArray(searchResult.results)
          ? (searchResult.results as any[])
          : [];
        const matching = results.find((r) => r?.video_id === video_id);

        if (matching) {
          const { data: upserted } = await supabase
            .from("videos")
            .upsert(
              {
                id: video_id,
                user_id: auth.userId,
                source: "research",
                youtube_video_id: matching.youtube_video_id ?? null,
                title: matching.title ?? "(untitled)",
                thumbnail_url: matching.thumbnail_url ?? null,
                published_at: matching.published_at ?? null,
                views_count: matching.views_count ?? null,
                channel_name: matching.channel_name ?? null,
              },
              { onConflict: "user_id,youtube_video_id" }
            )
            .select()
            .single();
          video = upserted as typeof video;
        }
      }
    }

    if (!video) return errorResponse("Video not found and could not be created", 404);

    // Create idea
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .insert({
        user_id: auth.userId,
        source_video_id: video.id,
        search_result_id: search_result_id || null,
        score: score || 0,
        score_breakdown: score_breakdown || {},
        status: "saved",
      })
      .select()
      .single();

    if (ideaError || !idea) return errorResponse(ideaError?.message || "Failed to save idea", 500);

    const ideaId = (idea as { id: string }).id;

    // Queue enrichment job
    const { data: job } = await supabase
      .from("jobs")
      .insert({
        user_id: auth.userId,
        type: "idea_enrich",
        status: "search_queued",
        input: { idea_id: ideaId },
      })
      .select("id")
      .single();

    return successResponse({ idea, enrichment_job_id: job?.id }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
