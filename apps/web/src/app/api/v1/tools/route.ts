import { NextRequest } from "next/server";
import { listTools, getTool } from "@/lib/tools/registry";
import {
  authenticateApiKey,
  unauthorizedResponse,
  successResponse,
} from "@/lib/api-auth";

/**
 * GET /api/v1/tools — List all available tools
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) return unauthorizedResponse();

  const toolNames = listTools();
  const tools = toolNames.map((name) => {
    const tool = getTool(name);
    return {
      name: tool?.name,
      version: tool?.version,
      description: tool?.description,
    };
  });

  return successResponse({ tools, count: tools.length });
}
