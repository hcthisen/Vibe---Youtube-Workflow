import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/projects — List all projects
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const supabase = getApiSupabase();
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, title, status, language_code, idea_id, created_at, updated_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (error) return errorResponse(error.message, 500);

    // Fetch asset counts per project
    const projectIds = (projects || []).map((p) => p.id);
    let assetCounts: Record<string, number> = {};
    if (projectIds.length > 0) {
      const { data: assets } = await supabase
        .from("project_assets")
        .select("project_id")
        .in("project_id", projectIds);

      if (assets) {
        for (const a of assets) {
          assetCounts[a.project_id] = (assetCounts[a.project_id] || 0) + 1;
        }
      }
    }

    return successResponse({
      projects: (projects || []).map((p) => ({
        ...p,
        asset_count: assetCounts[p.id] || 0,
      })),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

/**
 * POST /api/v1/projects — Create a new project
 * Body: { title, idea_id?, language_code?, status? }
 *
 * If idea_id is provided, creates from an existing idea (like the tool).
 * Otherwise creates a blank project with just a title.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    const { title, idea_id, language_code, status } = body;

    if (!title || typeof title !== "string") {
      return errorResponse("title is required");
    }

    const supabase = getApiSupabase();

    // If idea_id provided, use the tool system for full project creation
    if (idea_id) {
      const { executeTool } = await import("@/lib/tools/executor");
      const result = await executeTool({
        userId: auth.userId,
        toolName: "project_create_from_idea",
        input: { idea_id, title, language_code },
      });

      if (!result.success) return errorResponse(result.error || "Failed to create project", 500);
      return successResponse(result.data, 201);
    }

    // Create blank project
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: auth.userId,
        title,
        language_code: language_code || "en",
        status: status || "research",
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    return successResponse(project, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
