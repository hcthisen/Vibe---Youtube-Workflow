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

    // First attempt: insert idea referencing an existing videos row.
    // This can fail if the videos row wasn't stored (or an older worker version ran).
    const attempt1 = await supabase
      .from("ideas")
      .insert({
        user_id: user.id,
        source_video_id: video_id,
        search_result_id: search_result_id || null,
        score,
        score_breakdown,
        status: "saved",
      })
      .select()
      .single();

    if (!attempt1.error && attempt1.data) {
      return NextResponse.json({ idea: attempt1.data });
    }

    // Fallback: reconstruct the video row from the stored search_results payload, then save idea.
    if (!search_result_id) {
      return NextResponse.json(
        { error: attempt1.error?.message || "Failed to save idea (missing search_result_id for fallback)" },
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
        {
          error:
            attempt1.error?.message ||
            "Failed to save idea: could not find matching video in search_results payload",
        },
        { status: 500 }
      );
    }

    // Create or upsert a videos row for this user/video
    const upsertVideo = await supabase
      .from("videos")
      .upsert(
        {
          // Keep the same UUID so ideas.source_video_id can reference it deterministically
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
          // Prefer upsert by (user_id, youtube_video_id) so repeats don't duplicate
          // (requires migration 009_make_videos_upsertable.sql)
          onConflict: "user_id,youtube_video_id",
        }
      )
      .select("id")
      .single();

    if (upsertVideo.error || !upsertVideo.data) {
      return NextResponse.json(
        {
          error:
            upsertVideo.error?.message ||
            attempt1.error?.message ||
            "Failed to save idea: could not create corresponding video row",
        },
        { status: 500 }
      );
    }

    const attempt2 = await supabase
      .from("ideas")
      .insert({
        user_id: user.id,
        source_video_id: upsertVideo.data.id,
        search_result_id: search_result_id || null,
        score,
        score_breakdown,
        status: "saved",
      })
      .select()
      .single();

    if (attempt2.error || !attempt2.data) {
      return NextResponse.json(
        { error: attempt2.error?.message || attempt1.error?.message || "Failed to save idea" },
        { status: 500 }
      );
    }

    return NextResponse.json({ idea: attempt2.data });
  } catch (error) {
    console.error("Save idea error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

