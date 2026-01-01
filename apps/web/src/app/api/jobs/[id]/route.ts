import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job with ownership verification
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // If job is succeeded and has search_result_id in output, fetch the search results
    let searchResults = null;
    if (job.status === "succeeded" && job.output) {
      const output = job.output as { search_result_id?: string };
      if (output.search_result_id) {
        const { data } = await supabase
          .from("search_results")
          .select("*")
          .eq("id", output.search_result_id)
          .single();
        
        searchResults = data;
      }
    }

    return NextResponse.json({ 
      job,
      searchResults 
    });
  } catch (error) {
    console.error("Get job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}



