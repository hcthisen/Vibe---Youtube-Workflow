/**
 * Database Migration Runner
 * 
 * Usage: npx tsx supabase/run-migrations.ts
 * 
 * Requires DATABASE_URL environment variable
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import pg from "pg";

const { Client } = pg;

// Load environment variables from .env.local
const envPaths = [
  join(process.cwd(), ".env.local"),
  join(process.cwd(), "apps", "web", ".env.local"),
  join(process.cwd(), "..", "..", ".env.local"),
  join(process.cwd(), "..", "..", "apps", "web", ".env.local"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    console.log(`Loading environment from: ${envPath}`);
    config({ path: envPath });
    break;
  }
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: false, // Disable SSL for direct VPS connection
  });

  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Connected successfully!\n");

    // Get migration files
    // Handle being run from workspace or root
    let migrationsDir = join(process.cwd(), "supabase", "migrations");
    if (!existsSync(migrationsDir)) {
      // Running from workspace, go up to root
      migrationsDir = join(process.cwd(), "..", "..", "supabase", "migrations");
    }
    
    if (!existsSync(migrationsDir)) {
      console.error(`ERROR: Could not find migrations directory at ${migrationsDir}`);
      process.exit(1);
    }
    
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration file(s)\n`);

    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      
      try {
        await client.query(sql);
        console.log(`  ✓ ${file} completed\n`);
      } catch (error) {
        console.error(`  ✗ ${file} failed:`);
        console.error(`    ${(error as Error).message}\n`);
        // Continue with other migrations
      }
    }

    console.log("Migration run complete!");
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();

