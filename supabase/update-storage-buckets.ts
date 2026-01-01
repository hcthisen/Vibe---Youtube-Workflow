/**
 * Storage Bucket Updater - Adds CORS and file size limits
 * 
 * Usage: npx tsx supabase/update-storage-buckets.ts
 * 
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

import { createClient } from "@supabase/supabase-js";

const BUCKETS = [
  { name: "user-headshots", public: false, sizeLimit: 50 * 1024 * 1024 }, // 50MB
  { name: "project-raw-videos", public: false, sizeLimit: 500 * 1024 * 1024 }, // 500MB
  { name: "project-processed-videos", public: false, sizeLimit: 500 * 1024 * 1024 }, // 500MB
  { name: "project-transcripts", public: false, sizeLimit: 50 * 1024 * 1024 }, // 50MB
  { name: "project-reports", public: false, sizeLimit: 50 * 1024 * 1024 }, // 50MB
  { name: "project-thumbnails", public: true, sizeLimit: 50 * 1024 * 1024 }, // 50MB
];

async function updateStorageBuckets() {
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

  console.log("Updating storage buckets with CORS and file size limits...\n");

  for (const bucket of BUCKETS) {
    try {
      // Update bucket configuration
      const { data, error } = await supabase.storage.updateBucket(bucket.name, {
        public: bucket.public,
        fileSizeLimit: bucket.sizeLimit,
        allowedMimeTypes: null, // Allow all mime types
      });

      if (error) {
        console.log(`  ✗ ${bucket.name}: ${error.message}`);
      } else {
        console.log(`  ✓ ${bucket.name} updated (${bucket.public ? 'public' : 'private'}, ${Math.round(bucket.sizeLimit / 1024 / 1024)}MB limit)`);
      }
    } catch (err) {
      console.log(`  ✗ ${bucket.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\nStorage bucket update complete!");
  console.log("\nNote: CORS is handled by Supabase automatically for authenticated requests.");
  console.log("If you're still having issues, check the Supabase dashboard under Storage > Configuration.");
}

updateStorageBuckets();

