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
    const jobType = searchParams.get("type");

    // Get active (queued or running) jobs for this user
    let query = supabase
      .from("jobs")
      .select("*")
      .eq("user_id", user.id)
      // Include search-specific statuses so async search jobs are discoverable
      .in("status", ["queued", "running", "search_queued", "search_running"])
      .order("created_at", { ascending: false });

    if (jobType) {
      query = query.eq("type", jobType);
    } else {
      // Only return search jobs by default
      query = query.in("type", ["outlier_search", "deep_research"]);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: jobs || [] });
  } catch (error) {
    console.error("Get active jobs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

