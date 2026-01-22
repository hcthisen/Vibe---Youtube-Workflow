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

console.log("✅ Environment variables loaded");



