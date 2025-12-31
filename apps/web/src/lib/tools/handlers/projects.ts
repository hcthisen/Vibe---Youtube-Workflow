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

    // Get the idea
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("*")
      .eq("id", input.idea_id)
      .eq("user_id", context.userId)
      .single();

    if (ideaError || !idea) {
      return { success: false, error: "Idea not found", logs };
    }

    // Create the project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        idea_id: input.idea_id,
        title: input.title,
        status: "research",
      })
      .select()
      .single();

    if (projectError || !project) {
      return { success: false, error: projectError?.message || "Failed to create project", logs };
    }

    // Update idea status
    await supabase
      .from("ideas")
      .update({ status: "saved" })
      .eq("id", input.idea_id);

    logs.push(`Created project: ${project.id}`);

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

