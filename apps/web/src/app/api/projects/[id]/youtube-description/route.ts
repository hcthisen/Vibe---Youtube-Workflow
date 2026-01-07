import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient } from "@/lib/integrations/openai";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { transcript } = await request.json();

    if (typeof transcript !== "string" || transcript.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Transcript text is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const result = await getOpenAIClient().generateYouTubeDescription({
      transcript,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to generate description" },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("projects")
      .update({ youtube_description: result.description })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      description: result.description,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { description } = await request.json();

    if (typeof description !== "string") {
      return NextResponse.json(
        { success: false, error: "Description text is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("projects")
      .update({ youtube_description: description })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      description,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
