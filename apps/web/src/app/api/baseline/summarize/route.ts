import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { openaiClient } from "@/lib/integrations/openai";
import { dataForSeoClient } from "@/lib/integrations/dataforseo";

interface VideoTranscript {
  video_id: string;
  title: string;
  transcript: string | null;
}

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

    // Check if videos already have transcripts (for re-generation)
    const firstVideo = videos[0];
    const hasTranscripts = firstVideo && 'transcript' in firstVideo && firstVideo.transcript !== undefined;

    let videosWithTranscripts;

    if (hasTranscripts) {
      // Use pre-fetched transcripts (for re-generation)
      console.log(`Using pre-fetched transcripts for ${videos.length} videos...`);
      videosWithTranscripts = videos.map((v: VideoTranscript) => ({
        video_id: v.video_id,
        title: v.title,
        transcript: v.transcript,
        error: null,
      }));
    } else {
      // Fetch transcripts for each video (up to 10 videos to avoid rate limits)
      const videosToAnalyze = videos.slice(0, 10);
      
      console.log(`Fetching transcripts for ${videosToAnalyze.length} videos...`);
      
      const transcriptPromises = videosToAnalyze.map(async (video: { video_id: string; title: string }) => {
        try {
          const result = await dataForSeoClient.getVideoSubtitles(video.video_id);
          return {
            video_id: video.video_id,
            title: video.title,
            transcript: result.success ? result.transcript : null,
            error: result.success ? null : result.error,
          };
        } catch (err) {
          console.error(`Error fetching transcript for ${video.video_id}:`, err);
          return {
            video_id: video.video_id,
            title: video.title,
            transcript: null,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      });

      videosWithTranscripts = await Promise.all(transcriptPromises);
    }

    // Separate successful and failed transcript fetches
    const successfulVideos = videosWithTranscripts.filter((v) => v.transcript);
    const failedVideos = videosWithTranscripts.filter((v) => !v.transcript);

    if (failedVideos.length > 0) {
      console.log(`Failed to fetch transcripts for ${failedVideos.length} videos:`, 
        failedVideos.map(v => ({ id: v.video_id, error: v.error })));
    }

    if (successfulVideos.length === 0) {
      return NextResponse.json(
        { error: "No transcripts available for the selected videos. Videos may not have captions enabled." },
        { status: 400 }
      );
    }

    console.log(`Successfully fetched ${successfulVideos.length} transcripts`);

    // Truncate long transcripts (5000 chars per video as per plan)
    const processedVideos = successfulVideos.map((v) => ({
      title: v.title,
      transcript: v.transcript!.substring(0, 5000),
    }));

    // Store full transcripts for database (structure: {video_id, title, transcript})
    const transcriptsForDb: VideoTranscript[] = successfulVideos.map((v) => ({
      video_id: v.video_id,
      title: v.title,
      transcript: v.transcript,
    }));

    console.log(`Generating baseline summary with ${processedVideos.length} video transcripts...`);

    const result = await openaiClient.generateBaselineSummary({ videos: processedVideos });

    if (!result.success) {
      console.error("OpenAI baseline summary error:", result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    console.log("Successfully generated baseline summary");

    return NextResponse.json({
      summary: result.summary,
      keywords: result.keywords,
      transcripts: transcriptsForDb,
      warnings: failedVideos.length > 0 
        ? `${failedVideos.length} video(s) did not have transcripts available` 
        : null,
    });
  } catch (error) {
    console.error("Baseline summarize error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

