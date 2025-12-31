import { NextResponse } from "next/server";
import { listTools, getTool } from "@/lib/tools/registry";

export async function GET() {
  const toolNames = listTools();
  const tools = toolNames.map((name) => {
    const tool = getTool(name);
    return {
      name: tool?.name,
      version: tool?.version,
      description: tool?.description,
    };
  });

  return NextResponse.json({
    tools,
    count: tools.length,
  });
}

