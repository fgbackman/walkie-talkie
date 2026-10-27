#!/usr/bin/env node
/**
 * Regenerates supabase/_all_migrations.sql — every migration concatenated in
 * order, for projects set up by pasting into the Supabase SQL editor.
 *
 * An existing project must NOT re-run this file; apply only the migrations it
 * has not seen yet (see SETUP.md).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = "supabase/migrations";
const rule = "-- " + "=".repeat(72);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

let out =
  "-- Walkie Talkie: all migrations, concatenated in order.\n" +
  "-- Paste into Supabase -> SQL Editor -> New query -> Run (new projects only).\n" +
  `-- Generated ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}. Do not edit; edit the migrations.\n`;

for (const f of files) {
  out += `\n${rule}\n-- ${dir}/${f}\n${rule}\n`;
  out += readFileSync(`${dir}/${f}`, "utf8");
}
writeFileSync("supabase/_all_migrations.sql", out.endsWith("\n\n") ? out : out + "\n");
console.log(`bundled ${files.length} migrations`);
