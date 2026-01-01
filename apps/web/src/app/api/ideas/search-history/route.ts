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
    const searchType = searchParams.get("search_type");
    const limit = parseInt(searchParams.get("limit") || "10");

    let query = supabase
      .from("search_results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (searchType === "outlier_search" || searchType === "deep_research") {
      query = query.eq("search_type", searchType);
    }

    const { data: searchHistory, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ searchHistory });
  } catch (error) {
    console.error("Search history error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const { search_type, search_params, results } = await request.json();

    if (!search_type || !["outlier_search", "deep_research"].includes(search_type)) {
      return NextResponse.json(
        { error: "Invalid search_type. Must be 'outlier_search' or 'deep_research'" },
        { status: 400 }
      );
    }

    if (!results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: "Results must be an array" },
        { status: 400 }
      );
    }

    const { data: searchResult, error } = await supabase
      .from("search_results")
      .insert({
        user_id: user.id,
        search_type,
        search_params: search_params || {},
        results,
        results_count: results.length,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ searchResult });
  } catch (error) {
    console.error("Save search result error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}



