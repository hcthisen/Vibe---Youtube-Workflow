import { NextRequest } from "next/server";
import { getTool, listTools } from "@/lib/tools/registry";
import { executeTool } from "@/lib/tools/executor";
import type { Database } from "@/lib/database.types";
import {
  authenticateApiKey,
  getApiSupabase,
  unauthorizedResponse,
  errorResponse,
  successResponse,
} from "@/lib/api-auth";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * GET /api/v1/tools/[tool_name] — Get tool metadata & schema
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tool_name: string }> }
) {
  const auth = await authenticateApiKey(request);
  if (!auth) return unauthorizedResponse();

  const { tool_name } = await params;
  const tool = getTool(tool_name);

  if (!tool) {
    return errorResponse(`Tool not found: ${tool_name}. Available: ${listTools().join(", ")}`, 404);
  }

  return successResponse({
    name: tool.name,
    version: tool.version,
    description: tool.description,
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema)),
    outputSchema: JSON.parse(JSON.stringify(tool.outputSchema)),
  });
}

/**
 * POST /api/v1/tools/[tool_name] — Execute a tool
 * Body: tool input (varies per tool)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool_name: string }> }
) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) return unauthorizedResponse();

    const { tool_name } = await params;
    const tool = getTool(tool_name);

    if (!tool) {
      return errorResponse(
        `Tool not found: ${tool_name}. Available: ${listTools().join(", ")}`,
        404
      );
    }

    const input = await request.json();

    // Async search tools get queued as jobs
    const searchTools = ["outlier_search", "deep_research"];
    if (searchTools.includes(tool_name)) {
      const supabase = getApiSupabase();
      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .insert({
          user_id: auth.userId,
          type: tool_name,
          status: "search_queued",
          input,
        })
        .select()
        .single();

      const job = jobData as unknown as JobRow | null;
      if (jobError || !job) {
        return errorResponse(jobError?.message || "Failed to create job", 500);
      }

      return successResponse({
        job_id: job.id,
        status: job.status,
        message: `Search job created. Poll /api/v1/jobs/${job.id} for status.`,
      });
    }

    // Execute synchronously
    const result = await executeTool({
      userId: auth.userId,
      toolName: tool_name,
      input,
    });

    if (!result.success) return errorResponse(result.error || "Tool execution failed", 400);
    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
