import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { openaiClient } from "@/lib/integrations/openai";
import { dataForSeoClient } from "@/lib/integrations/dataforseo";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videos } = await request.json();

    if (!videos || !Array.isArray(videos)) {
      return NextResponse.json(
        { error: "Videos array is required" },
        { status: 400 }
      );
    }

    // Fetch transcripts for each video (up to 10 videos to avoid rate limits)
    const videosToAnalyze = videos.slice(0, 10);
    const transcriptPromises = videosToAnalyze.map(async (video: { video_id: string; title: string }) => {
      const result = await dataForSeoClient.getVideoSubtitles(video.video_id);
      return {
        title: video.title,
        transcript: result.success ? result.transcript : null,
      };
    });

    const videosWithTranscripts = await Promise.all(transcriptPromises);

    // Filter out videos without transcripts and truncate long transcripts
    const processedVideos = videosWithTranscripts
      .filter((v) => v.transcript)
      .map((v) => ({
        title: v.title,
        transcript: v.transcript!.substring(0, 2000), // Limit to 2000 chars per video
      }));

    if (processedVideos.length === 0) {
      return NextResponse.json(
        { error: "No transcripts available for the selected videos" },
        { status: 400 }
      );
    }

    const result = await openaiClient.generateBaselineSummary({ videos: processedVideos });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      summary: result.summary,
      keywords: result.keywords,
    });
  } catch (error) {
    console.error("Baseline summarize error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

