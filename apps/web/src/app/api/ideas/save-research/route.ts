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

    const {
      title_concept,
      thesis,
      why_now,
      hook_options,
      thumbnail_text_ideas,
      search_queries_used,
      search_result_id,
    } = await request.json();

    const { data: idea, error } = await supabase
      .from("ideas")
      .insert({
        user_id: user.id,
        search_result_id: search_result_id || null,
        ai_summary: `${title_concept}\n\n${thesis}`,
        why_now: why_now || null,
        hook_options,
        title_variants: thumbnail_text_ideas,
        search_queries_used: search_queries_used || [],
        status: "saved",
        score: 0,
        score_breakdown: {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ idea });
  } catch (error) {
    console.error("Save research idea error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

