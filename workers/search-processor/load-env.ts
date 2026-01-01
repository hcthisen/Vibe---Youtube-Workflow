/**
 * Environment loader - MUST be imported first before any other modules
 * Loads environment variables needed by integrations
 */
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load from multiple possible locations
dotenv.config({ path: resolve(__dirname, "../../.env.local") });
dotenv.config({ path: resolve(__dirname, "../../.env.production") });
dotenv.config({ path: resolve(__dirname, "../../apps/web/.env.local") });

// #region agent log
fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'load-env.ts:14',message:'Environment loaded',data:{hasSupabaseUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasSupabaseKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY,hasDataForSeoLogin:!!process.env.DATAFORSEO_LOGIN,hasDataForSeoPass:!!process.env.DATAFORSEO_PASSWORD,hasOpenAI:!!process.env.OPENAI_API_KEY},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
// #endregion

console.log("✅ Environment variables loaded");



