import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/tools/executor";
import { getTool, listTools } from "@/lib/tools/registry";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool_name: string }> }
) {
  try {
    const { tool_name } = await params;
    
    // Check if tool exists
    const tool = getTool(tool_name);
    if (!tool) {
      return NextResponse.json(
        {
          success: false,
          error: `Tool not found: ${tool_name}`,
          available_tools: listTools(),
        },
        { status: 404 }
      );
    }

    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse input
    const input = await request.json();

    // Execute tool
    const result = await executeTool({
      userId: user.id,
      toolName: tool_name,
      input,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error("Tool execution error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tool_name: string }> }
) {
  const { tool_name } = await params;
  
  const tool = getTool(tool_name);
  if (!tool) {
    return NextResponse.json(
      {
        success: false,
        error: `Tool not found: ${tool_name}`,
        available_tools: listTools(),
      },
      { status: 404 }
    );
  }

  // Return tool metadata
  return NextResponse.json({
    name: tool.name,
    version: tool.version,
    description: tool.description,
    // Include schema info for documentation
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema)),
    outputSchema: JSON.parse(JSON.stringify(tool.outputSchema)),
  });
}

