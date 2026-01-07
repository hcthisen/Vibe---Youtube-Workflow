import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { video_id, score, score_breakdown, search_result_id } = await request.json();

    if (!video_id) {
      return NextResponse.json({ error: "video_id is required" }, { status: 400 });
    }

    let video = await supabase
      .from("videos")
      .select("id, youtube_video_id, title, thumbnail_url, channel_name, published_at, views_count")
      .eq("id", video_id)
      .eq("user_id", user.id)
      .single();

    if (video.error || !video.data) {
      if (!search_result_id) {
        return NextResponse.json(
          { error: video.error?.message || "Failed to save idea (missing search_result_id for fallback)" },
          { status: 500 }
        );
      }

      const { data: searchResult, error: searchResultError } = await supabase
        .from("search_results")
        .select("id, results")
        .eq("id", search_result_id)
        .eq("user_id", user.id)
        .single();

      if (searchResultError || !searchResult) {
        return NextResponse.json(
          { error: searchResultError?.message || "Failed to load search result for fallback save" },
          { status: 500 }
        );
      }

      const results = Array.isArray(searchResult.results) ? (searchResult.results as any[]) : [];
      const matching = results.find((r) => r?.video_id === video_id);

      if (!matching) {
        return NextResponse.json(
          { error: "Failed to save idea: could not find matching video in search_results payload" },
          { status: 500 }
        );
      }

      const upsertVideo = await supabase
        .from("videos")
        .upsert(
          {
            id: video_id,
            user_id: user.id,
            source: "research",
            youtube_video_id: matching.youtube_video_id ?? null,
            title: matching.title ?? "(untitled)",
            thumbnail_url: matching.thumbnail_url ?? null,
            published_at: matching.published_at ?? null,
            views_count: matching.views_count ?? null,
            channel_name: matching.channel_name ?? null,
          },
          {
            onConflict: "user_id,youtube_video_id",
          }
        )
        .select("id, youtube_video_id, title, thumbnail_url, channel_name, published_at, views_count")
        .single();

      if (upsertVideo.error || !upsertVideo.data) {
        return NextResponse.json(
          { error: upsertVideo.error?.message || "Failed to save idea: could not create video row" },
          { status: 500 }
        );
      }

      video = upsertVideo;
    }

    const videoData = video.data;

    const { data: idea, error } = await supabase
      .from("ideas")
      .insert({
        user_id: user.id,
        source_video_id: videoData.id,
        search_result_id: search_result_id || null,
        score: score || 0,
        score_breakdown: score_breakdown || {},
        status: "saved",
      })
      .select()
      .single();

    if (error || !idea) {
      return NextResponse.json({ error: error?.message || "Failed to save idea" }, { status: 500 });
    }

    const ideaId = (idea as { id: string }).id;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        type: "idea_enrich",
        status: "search_queued",
        input: {
          idea_id: ideaId,
        },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || "Failed to queue idea enrichment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ idea, job_id: job.id });
  } catch (error) {
    console.error("Save idea error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

