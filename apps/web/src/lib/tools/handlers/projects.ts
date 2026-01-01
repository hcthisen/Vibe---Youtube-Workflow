import type { ToolRunContext, ToolResult } from "../registry";
import type {
  ProjectCreateFromIdeaInput,
  ProjectCreateFromIdeaOutput,
  ProjectGenerateOutlineInput,
  ProjectGenerateOutlineOutput,
  ProjectGenerateTitlesInput,
  ProjectGenerateTitlesOutput,
} from "../schemas";
import { openaiClient } from "@/lib/integrations/openai";
import { createServiceClient } from "@/lib/supabase/service";

export async function projectCreateFromIdeaHandler(
  input: ProjectCreateFromIdeaInput,
  context: ToolRunContext
): Promise<ToolResult<ProjectCreateFromIdeaOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Creating project from idea: ${input.idea_id}`);

    const supabase = await createServiceClient();

    // Get the idea with related video data
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("*, videos(*)")
      .eq("id", input.idea_id)
      .eq("user_id", context.userId)
      .single();

    if (ideaError || !idea) {
      return { success: false, error: "Idea not found", logs };
    }

    // Generate markdown brief from idea data
    const ideaBriefMarkdown = generateIdeaBriefMarkdown(idea);
    logs.push("Generated idea brief markdown");

    // Create the project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        idea_id: input.idea_id,
        title: input.title,
        status: "research",
        idea_brief_markdown: ideaBriefMarkdown,
      })
      .select()
      .single();

    if (projectError || !project) {
      return { success: false, error: projectError?.message || "Failed to create project", logs };
    }

    // Update idea status to project_created
    await supabase
      .from("ideas")
      .update({ status: "project_created" })
      .eq("id", input.idea_id);

    logs.push(`Created project: ${project.id}`);
    logs.push("Updated idea status to 'project_created'");

    return {
      success: true,
      data: {
        project_id: project.id,
        title: project.title,
        status: project.status,
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

function generateIdeaBriefMarkdown(idea: any): string {
  const sections: string[] = [];

  sections.push("# Idea Brief\n");

  // Summary section
  if (idea.ai_summary) {
    sections.push("## Summary\n");
    sections.push(`${idea.ai_summary}\n`);
  }

  // Hook Options
  if (idea.hook_options && Array.isArray(idea.hook_options) && idea.hook_options.length > 0) {
    sections.push("## Hook Options\n");
    idea.hook_options.forEach((hook: string, index: number) => {
      sections.push(`${index + 1}. ${hook}`);
    });
    sections.push("");
  }

  // Thumbnail Ideas
  if (idea.title_variants && Array.isArray(idea.title_variants) && idea.title_variants.length > 0) {
    sections.push("## Thumbnail Text Ideas\n");
    idea.title_variants.forEach((variant: string) => {
      sections.push(`- ${variant}`);
    });
    sections.push("");
  }

  // Score information (if from outlier search)
  if (idea.score && idea.score > 0) {
    sections.push("## Outlier Score\n");
    sections.push(`**${idea.score.toFixed(1)}x** outlier performance\n`);
  }

  // Source video information
  if (idea.videos) {
    const video = idea.videos;
    sections.push("## Source Video\n");
    if (video.title) {
      sections.push(`**Title:** ${video.title}\n`);
    }
    if (video.channel_name) {
      sections.push(`**Channel:** ${video.channel_name}\n`);
    }
    if (video.views_count) {
      sections.push(`**Views:** ${video.views_count.toLocaleString()}\n`);
    }
    if (video.youtube_video_id) {
      sections.push(`**Watch:** https://youtube.com/watch?v=${video.youtube_video_id}\n`);
    }
  }

  return sections.join("\n");
}

export async function projectGenerateOutlineHandler(
  input: ProjectGenerateOutlineInput,
  context: ToolRunContext
): Promise<ToolResult<ProjectGenerateOutlineOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Generating outline for project: ${input.project_id}`);

    const supabase = await createServiceClient();

    // Get the project and associated idea
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*, ideas(*)")
      .eq("id", input.project_id)
      .eq("user_id", context.userId)
      .single();

    if (projectError || !project) {
      return { success: false, error: "Project not found", logs };
    }

    const idea = project.ideas as { ai_summary?: string; title_variants?: string[] } | null;

    const result = await openaiClient.generateOutline({
      title: project.title,
      context: input.context || idea?.ai_summary || "",
      existingHooks: idea?.title_variants || [],
    });

    if (!result.success) {
      return { success: false, error: result.error, logs };
    }

    // Save outline to project
    await supabase
      .from("projects")
      .update({
        outline: result.outline,
        status: "outline",
      })
      .eq("id", input.project_id);

    logs.push("Outline generated and saved");

    return {
      success: true,
      data: {
        outline: result.outline,
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

export async function projectGenerateTitlesHandler(
  input: ProjectGenerateTitlesInput,
  context: ToolRunContext
): Promise<ToolResult<ProjectGenerateTitlesOutput>> {
  const logs: string[] = [];

  try {
    logs.push(`Generating titles for project: ${input.project_id}`);

    const supabase = await createServiceClient();

    // Get the project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*, ideas(*)")
      .eq("id", input.project_id)
      .eq("user_id", context.userId)
      .single();

    if (projectError || !project) {
      return { success: false, error: "Project not found", logs };
    }

    const idea = project.ideas as { ai_summary?: string } | null;

    const result = await openaiClient.generateTitles({
      currentTitle: project.title,
      context: idea?.ai_summary || "",
      count: input.count || 10,
    });

    if (!result.success) {
      return { success: false, error: result.error, logs };
    }

    // Save titles to project
    await supabase
      .from("projects")
      .update({
        title_variants: result.titles,
      })
      .eq("id", input.project_id);

    logs.push(`Generated ${result.titles.length} title variants`);

    return {
      success: true,
      data: {
        title_variants: result.titles,
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

