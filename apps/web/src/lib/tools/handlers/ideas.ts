import type { ToolRunContext, ToolResult } from "../registry";
import type { IdeaEnrichInput, IdeaEnrichOutput } from "../schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { getDataForSeoClient } from "@/lib/integrations/dataforseo";
import { getOpenAIClient } from "@/lib/integrations/openai";

const MAX_TRANSCRIPT_CHARS = 4000;

export async function ideaEnrichHandler(
  input: IdeaEnrichInput,
  context: ToolRunContext
): Promise<ToolResult<IdeaEnrichOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Enriching idea: ${input.idea_id}`);

    const supabase = await createServiceClient();

    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, user_id, source_video_id, transcript, transcript_language")
      .eq("id", input.idea_id)
      .eq("user_id", context.userId)
      .single();

    if (ideaError || !idea) {
      return { success: false, error: "Idea not found", logs };
    }

    if (!idea.source_video_id) {
      return { success: false, error: "Idea is missing a source video", logs };
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, youtube_video_id, title, channel_name")
      .eq("id", idea.source_video_id)
      .eq("user_id", context.userId)
      .single();

    if (videoError || !video) {
      return { success: false, error: "Source video not found", logs };
    }

    const { data: channel } = await supabase
      .from("channels")
      .select("baseline_summary, baseline_keywords")
      .eq("user_id", context.userId)
      .single();

    const baselineContext = channel?.baseline_summary || "";
    const baselineKeywords = (channel?.baseline_keywords as string[]) || [];

    let transcript = idea.transcript;
    let transcriptLanguage = idea.transcript_language;

    if (!transcript && video.youtube_video_id) {
      try {
        const subtitles = await getDataForSeoClient().getVideoSubtitles(
          video.youtube_video_id
        );
        if (subtitles.success) {
          transcript = subtitles.transcript || null;
          transcriptLanguage = subtitles.language || null;
          logs.push("Fetched transcript from DataForSEO");
        } else {
          logs.push("Transcript unavailable from DataForSEO");
        }
      } catch (error) {
        logs.push(
          `Transcript fetch failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (transcript || transcriptLanguage) {
      await supabase
        .from("ideas")
        .update({
          transcript: transcript || null,
          transcript_language: transcriptLanguage || null,
        })
        .eq("id", idea.id)
        .eq("user_id", context.userId);
    }

    const transcriptExcerpt = transcript
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS)
      : null;

    const adapted = await getOpenAIClient().generateAdaptedIdeaFromSource({
      baselineContext,
      baselineKeywords,
      sourceTitle: video.title || "Untitled",
      sourceChannel: video.channel_name,
      transcript: transcriptExcerpt,
    });

    if (!adapted.success) {
      return { success: false, error: adapted.error || "LLM enrichment failed", logs };
    }

    const aiSummary = `${adapted.title_concept}\n\n${adapted.thesis}`;

    const { error: updateError } = await supabase
      .from("ideas")
      .update({
        ai_summary: aiSummary,
        hook_options: adapted.hook_options,
        title_variants: adapted.thumbnail_text_ideas,
        why_now: adapted.why_now,
      })
      .eq("id", idea.id)
      .eq("user_id", context.userId);

    if (updateError) {
      return { success: false, error: updateError.message, logs };
    }

    logs.push("Idea enrichment saved");

    return {
      success: true,
      data: {
        idea_id: idea.id,
      },
      logs,
    };
  } catch (error) {
    logs.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      logs,
    };
  }
}
