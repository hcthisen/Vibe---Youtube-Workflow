import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const searchResultId = searchParams.get("search_result_id");

    if (!searchResultId) {
      return NextResponse.json({ error: "search_result_id is required" }, { status: 400 });
    }

    const { data: savedIdeas, error } = await supabase
      .from("ideas")
      .select("id, ai_summary, search_result_id")
      .eq("user_id", user.id)
      .eq("search_result_id", searchResultId)
      .in("status", ["saved", "project_created"]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ savedIdeas: savedIdeas || [] });
  } catch (error) {
    console.error("Get saved ideas error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}


