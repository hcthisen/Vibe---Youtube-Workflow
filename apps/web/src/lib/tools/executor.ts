import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/database.types";
import type { ToolRunContext, ToolResult, ToolDefinition } from "./registry";
import { getTool } from "./registry";

type ToolRunRow = Database["public"]["Tables"]["tool_runs"]["Row"];

export interface ExecuteToolOptions {
  userId: string;
  toolName: string;
  input: unknown;
}

export interface ExecuteToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  runId: string;
  durationMs: number;
}

export async function executeTool<T = unknown>(
  options: ExecuteToolOptions
): Promise<ExecuteToolResult<T>> {
  const { userId, toolName, input } = options;
  const startTime = Date.now();

  // Get tool definition
  const tool = getTool(toolName);
  if (!tool) {
    return {
      success: false,
      error: `Tool not found: ${toolName}`,
      runId: "",
      durationMs: Date.now() - startTime,
    };
  }

  // Create Supabase client with service role
  const supabase = await createServiceClient();

  // Create tool run record
  const { data: toolRun, error: insertError } = await supabase
    .from("tool_runs")
    .insert({
      user_id: userId,
      tool_name: toolName,
      tool_version: tool.version,
      status: "started",
      input: input as any,
    })
    .select()
    .single();

  if (insertError || !toolRun) {
    console.error("Failed to create tool run:", insertError);
    return {
      success: false,
      error: "Failed to create tool run record",
      runId: "",
      durationMs: Date.now() - startTime,
    };
  }

  const runId = (toolRun as unknown as ToolRunRow).id;
  const logs: string[] = [];

  try {
    // Validate input
    const parseResult = tool.inputSchema.safeParse(input);
    if (!parseResult.success) {
      const validationError = `Input validation failed: ${parseResult.error.message}`;
      logs.push(validationError);

      await updateToolRun(supabase, runId, {
        status: "failed",
        output: null,
        logs: logs.join("\n"),
        duration_ms: Date.now() - startTime,
      });

      return {
        success: false,
        error: validationError,
        runId,
        durationMs: Date.now() - startTime,
      };
    }

    logs.push(`Input validated successfully`);

    // Create context
    const context: ToolRunContext = {
      userId,
      toolName,
      toolVersion: tool.version,
      runId,
    };

    // Execute handler
    logs.push(`Executing tool handler...`);
    const result = await (tool as ToolDefinition).handler(parseResult.data, context);

    const durationMs = Date.now() - startTime;
    logs.push(`Handler completed in ${durationMs}ms`);

    if (result.success) {
      // Validate output
      const outputParseResult = tool.outputSchema.safeParse(result.data);
      if (!outputParseResult.success) {
        logs.push(`Output validation warning: ${outputParseResult.error.message}`);
      }

      await updateToolRun(supabase, runId, {
        status: "succeeded",
        output: result.data as any,
        logs: [...logs, ...(result.logs || [])].join("\n"),
        duration_ms: durationMs,
      });

      return {
        success: true,
        data: result.data as T,
        runId,
        durationMs,
      };
    } else {
      logs.push(`Handler failed: ${result.error}`);

      await updateToolRun(supabase, runId, {
        status: "failed",
        output: null,
        logs: [...logs, ...(result.logs || [])].join("\n"),
        duration_ms: durationMs,
      });

      return {
        success: false,
        error: result.error,
        runId,
        durationMs,
      };
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push(`Unexpected error: ${errorMessage}`);

    await updateToolRun(supabase, runId, {
      status: "failed",
      output: null,
      logs: logs.join("\n"),
      duration_ms: durationMs,
    });

    return {
      success: false,
      error: errorMessage,
      runId,
      durationMs,
    };
  }
}

async function updateToolRun(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  runId: string,
  updates: {
    status: string;
    output: any;
    logs: string;
    duration_ms: number;
  }
): Promise<void> {
  const { error } = await supabase
    .from("tool_runs")
    .update(updates)
    .eq("id", runId);

  if (error) {
    console.error("Failed to update tool run:", error);
  }
}

