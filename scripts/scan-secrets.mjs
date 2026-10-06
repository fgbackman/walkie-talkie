#!/usr/bin/env node
/**
 * Fails the build if a server-only secret made it into a client bundle.
 *
 * The usual way this happens is someone adds NEXT_PUBLIC_ to a variable to
 * "make it work" in a client component. This catches that before it ships.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [".next/static", ".next/server/app"];

const SECRETS = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.LIVEKIT_API_SECRET,
].filter((s) => typeof s === "string" && s.length > 16);

// Even without the env vars present, catch the shapes.
const PATTERNS = [
  /service_role/,
  /"role"\s*:\s*"service_role"/,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/,
  /LIVEKIT_API_SECRET\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/,
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|cjs|json|txt|map)$/.test(name)) yield full;
  }
}

let bad = 0;
const clientOnly = ".next/static";

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");

    for (const secret of SECRETS) {
      if (text.includes(secret)) {
        console.error(`LEAK  literal secret value in ${file}`);
        bad++;
      }
    }

    // Pattern checks only apply to the client bundle; the server bundle is
    // allowed to reference the names.
    if (file.startsWith(clientOnly)) {
      for (const re of PATTERNS) {
        if (re.test(text)) {
          console.error(`LEAK  ${re} matched in ${file}`);
          bad++;
        }
      }
    }
  }
}

if (bad > 0) {
  console.error(`\n${bad} potential secret leak(s). Build rejected.`);
  process.exit(1);
}
console.log("secrets: clean");
