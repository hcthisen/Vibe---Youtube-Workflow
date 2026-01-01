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

    // For search tools, create async job instead of executing immediately
    const searchTools = ["outlier_search", "deep_research"];
    if (searchTools.includes(tool_name)) {
      // Create job for async execution
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          user_id: user.id,
          type: tool_name,
          // IMPORTANT: Use search_* statuses so the media worker (python) does not
          // pick these up. The search worker (node) will process these.
          status: "search_queued",
          input,
        })
        .select()
        .single();

      if (jobError || !job) {
        return NextResponse.json(
          {
            success: false,
            error: jobError?.message || "Failed to create job",
          },
          { status: 500 }
        );
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/tools/[tool_name]/route.ts:75',message:'Created async search job',data:{jobId:job.id,toolName:tool_name,status:job.status},timestamp:Date.now(),sessionId:'debug-session',runId:'status-fix',hypothesisId:'FIX'})}).catch(()=>{});
      // #endregion

      return NextResponse.json({
        success: true,
        data: {
          job_id: job.id,
          status: job.status,
          message: "Search job created. Poll /api/jobs/[id] for status.",
        },
      });
    }

    // Execute tool synchronously for non-search tools
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

