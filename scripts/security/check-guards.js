const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
]);

const ALLOWLIST_FILES = new Set([
  path.join(repoRoot, "scripts", "security", "check-guards.js"),
]);

const TELEMETRY_PATTERNS = [
  "127.0.0.1:7242/ingest",
];

const GUARD_CHECKS = [
  {
    file: "apps/web/src/app/api/thumbnail-presets/route.ts",
    mustInclude: ["validateExternalUrl", "fetchImageWithLimit"],
  },
  {
    file: "apps/web/src/lib/integrations/pose-analysis.ts",
    mustInclude: ["validateExternalUrl"],
  },
  {
    file: "apps/web/src/lib/tools/handlers/thumbnails.ts",
    mustInclude: ["validateExternalUrl"],
  },
  {
    file: "apps/web/src/lib/integrations/nano-banana.ts",
    mustInclude: ["validateExternalUrl"],
  },
  {
    file: "workers/media/handlers/pose_analyze.py",
    mustInclude: ["validate_external_url"],
  },
  {
    file: "workers/media/handlers/thumbnail_generate.py",
    mustInclude: ["validate_external_url"],
  },
  {
    file: "workers/media/utils/url_safety.py",
    mustInclude: ["validate_external_url"],
  },
];

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env") {
      if (entry.name === ".git" || entry.name === ".next") {
        continue;
      }
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function readFileSafe(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return null;
    }
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function checkTelemetry() {
  const offenders = [];
  const files = walk(repoRoot);

  for (const filePath of files) {
    if (ALLOWLIST_FILES.has(filePath)) {
      continue;
    }
    const content = readFileSafe(filePath);
    if (!content) continue;

    for (const pattern of TELEMETRY_PATTERNS) {
      if (content.includes(pattern)) {
        offenders.push({ filePath, pattern });
      }
    }
  }

  return offenders;
}

function checkGuards() {
  const failures = [];

  for (const check of GUARD_CHECKS) {
    const filePath = path.join(repoRoot, check.file);
    const content = readFileSafe(filePath);
    if (!content) {
      failures.push({ file: check.file, missing: check.mustInclude, reason: "file not readable" });
      continue;
    }

    const missing = check.mustInclude.filter((token) => !content.includes(token));
    if (missing.length > 0) {
      failures.push({ file: check.file, missing, reason: "token not found" });
    }
  }

  return failures;
}

function main() {
  const telemetryOffenders = checkTelemetry();
  const guardFailures = checkGuards();

  if (telemetryOffenders.length === 0 && guardFailures.length === 0) {
    console.log("Security guard checks passed.");
    return;
  }

  console.error("Security guard checks failed.");

  if (telemetryOffenders.length > 0) {
    console.error("\nDisallowed telemetry endpoints detected:");
    for (const offender of telemetryOffenders) {
      console.error(`- ${offender.filePath} contains ${offender.pattern}`);
    }
  }

  if (guardFailures.length > 0) {
    console.error("\nMissing SSRF guard hooks:");
    for (const failure of guardFailures) {
      console.error(`- ${failure.file}: missing ${failure.missing.join(", ")} (${failure.reason})`);
    }
  }

  process.exit(1);
}

main();
