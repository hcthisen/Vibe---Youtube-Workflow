/**
 * Search Processor Worker
 * 
 * Background worker that processes async search jobs:
 * - Polls for queued outlier_search and deep_research jobs
 * - Enforces concurrency limits
 * - Executes searches using tool handlers
 * - Updates job status and saves results
 */

// CRITICAL: Load environment variables FIRST before any other imports
import "./load-env";

import { createClient } from "@supabase/supabase-js";

// #region agent log
fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:16',message:'Worker starting - after load-env import',data:{cwd:process.cwd(),hasSupabaseUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasDataForSeoLogin:!!process.env.DATAFORSEO_LOGIN},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
// #endregion

// Import tools directly from registry (env vars now available)
import { getTool } from "../../apps/web/src/lib/tools/registry";
import type { ToolRunContext, ToolResult } from "../../apps/web/src/lib/tools/registry";

// #region agent log
fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:25',message:'Tool registry imported successfully',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
// #endregion

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const POLL_INTERVAL = 10000; // 10 seconds
const JOB_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT_PER_USER = 1; // Max 1 search of each type per user

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: Missing required environment variables");
  console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log("🔍 Search Processor Worker starting...");
console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
console.log(`   Job timeout: ${JOB_TIMEOUT}ms`);
console.log(`   Max concurrent per user/type: ${MAX_CONCURRENT_PER_USER}`);

interface Job {
  id: string;
  user_id: string;
  type: string;
  status: string;
  input: any;
  created_at: string;
}

/**
 * Check if user has reached concurrency limit for this job type
 */
async function checkConcurrencyLimit(userId: string, jobType: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("type", jobType)
    // Search worker uses search_* statuses (so media worker won't claim them)
    .in("status", ["search_running", "running"])
    .limit(MAX_CONCURRENT_PER_USER);

  if (error) {
    console.error("Error checking concurrency:", error);
    return false;
  }

  return (data?.length || 0) < MAX_CONCURRENT_PER_USER;
}

/**
 * Process a single job
 */
async function processJob(job: Job): Promise<void> {
  console.log(`\n📋 Processing job ${job.id} (${job.type})`);
  console.log(`   User: ${job.user_id}`);
  console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);

  // Update status to running
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ 
      status: "search_running",
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id);

  if (updateError) {
    console.error(`   ❌ Failed to update job status:`, updateError);
    return;
  }

  console.log(`   ⚙️  Status updated to search_running`);

  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:120',message:'Getting tool from registry',data:{jobType:job.type,jobId:job.id},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    
    // Get the tool from registry
    const tool = getTool(job.type);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:127',message:'Tool lookup result',data:{foundTool:!!tool,toolName:tool?.name,jobType:job.type},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    
    if (!tool) {
      throw new Error(`Unknown tool: ${job.type}`);
    }

    console.log(`   🔧 Executing tool: ${tool.name} v${tool.version}`);

    // Create tool context
    const context: ToolRunContext = {
      userId: job.user_id,
      toolName: tool.name,
      toolVersion: tool.version,
      runId: job.id,
    };

    // Execute the tool with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Job timeout after 5 minutes")), JOB_TIMEOUT)
    );

    const executePromise = tool.handler(job.input, context);

    const result: any = await Promise.race([executePromise, timeoutPromise]);

    if (!result.success) {
      throw new Error(result.error || "Tool execution failed");
    }

    console.log(`   ✅ Tool executed successfully`);

    // For search tools, result.data should contain the search results
    const isSearchJob = job.type === "outlier_search" || job.type === "deep_research";

    if (isSearchJob) {
      // Save to search_results table
      const searchParams = job.input;
      const searchResults = job.type === "outlier_search"
        ? result.data.results
        : result.data.ideas;

      const { data: searchResult, error: saveError } = await supabase
        .from("search_results")
        .insert({
          user_id: job.user_id,
          search_type: job.type,
          search_params: searchParams,
          results: searchResults,
          results_count: searchResults?.length || 0,
        })
        .select()
        .single();

      if (saveError || !searchResult) {
        throw new Error(`Failed to save search results: ${saveError?.message}`);
      }

      console.log(`   ? Saved ${searchResults?.length || 0} results to search_results table`);

      // Update job with success status
      const { error: successError } = await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          output: {
            search_result_id: searchResult.id,
            results_count: searchResults?.length || 0,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (successError) {
        console.error(`   ??  Warning: Job succeeded but failed to update status:`, successError);
      } else {
        console.log(`   ? Job completed successfully`);
      }
    } else {
      const { error: successError } = await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          output: result.data || {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (successError) {
        console.error(`   ??  Warning: Job succeeded but failed to update status:`, successError);
      } else {
        console.log(`   ? Job completed successfully`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Job failed:`, errorMessage);

    // Update job with failed status
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

/**
 * Poll for and process jobs
 */
async function pollJobs(): Promise<void> {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:199',message:'Polling for jobs',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    // Get queued search jobs
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "search_queued")
      .in("type", ["outlier_search", "deep_research", "idea_enrich"])
      .order("created_at", { ascending: true })
      .limit(10);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:210',message:'Query result',data:{hasError:!!error,errorMsg:error?.message,jobsCount:jobs?.length||0,jobTypes:jobs?.map(j=>j.type)||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F,I'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("Error fetching jobs:", error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return; // No jobs to process
    }

    console.log(`\n🔄 Found ${jobs.length} queued job(s)`);

    // Process jobs with concurrency limits
    for (const job of jobs) {
      const canProcess = await checkConcurrencyLimit(job.user_id, job.type);
      
      if (!canProcess) {
        console.log(`⏸️  Skipping job ${job.id} - user concurrency limit reached`);
        continue;
      }

      await processJob(job);
    }

  } catch (error) {
    console.error("Error in poll cycle:", error);
  }
}

/**
 * Main worker loop
 */
async function main() {
  console.log("✅ Worker ready and polling for jobs\n");

  // Run immediately
  await pollJobs();

  // Then poll on interval
  setInterval(async () => {
    await pollJobs();
  }, POLL_INTERVAL);
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n⏹️  Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n⏹️  Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

// Start the worker
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

