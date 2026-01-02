/**
 * Storage Bucket Creator
 * 
 * Usage: npx tsx supabase/create-storage-buckets.ts
 * 
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

// Load environment variables from .env.local
const envPaths = [
  join(process.cwd(), ".env.local"),
  join(process.cwd(), "apps", "web", ".env.local"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    console.log(`Loading environment from: ${envPath}`);
    config({ path: envPath });
    break;
  }
}

const BUCKETS = [
  { name: "user-headshots", public: false },
  { name: "thumbnail-preset-styles", public: false }, // User preset thumbnail styles
  { name: "project-raw-videos", public: false },
  { name: "project-processed-videos", public: false },
  { name: "project-transcripts", public: false },
  { name: "project-reports", public: false },
  { name: "project-thumbnails", public: true }, // Thumbnails can be public for sharing
];

async function createStorageBuckets() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("Creating storage buckets...\n");

  for (const bucket of BUCKETS) {
    const { data, error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.name.includes("video") ? 1024 * 1024 * 500 : 1024 * 1024 * 50, // 500MB for videos, 50MB for others
    });

    if (error) {
      if (error.message.includes("already exists")) {
        console.log(`  ○ ${bucket.name} (already exists)`);
      } else {
        console.log(`  ✗ ${bucket.name}: ${error.message}`);
      }
    } else {
      console.log(`  ✓ ${bucket.name} created`);
    }
  }

  console.log("\nStorage bucket setup complete!");
}

createStorageBuckets();

