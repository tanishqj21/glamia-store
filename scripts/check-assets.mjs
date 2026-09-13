import { readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";

const dir = "public/assets";
const html = readFileSync("public/index.html", "utf8");
const buildTime = statSync("public/index.html").mtimeMs - 1000;

const all = readdirSync(dir);
const current = new Set(all.filter((f) => statSync(join(dir, f)).mtimeMs >= buildTime));
const stale = all.filter((f) => !current.has(f));
if (!current.size) throw new Error("No current chunks detected — refusing to clean.");

// Safety net: every asset referenced by the current build must be current.
const referenced = new Set();
for (const m of html.matchAll(/assets\/[\w.-]+\.(?:js|css)/g)) referenced.add(basename(m[0]));
const quotedRe = /["']([\w./-]+\.(?:js|css))["']/g;
for (const f of current) {
  const src = readFileSync(join(dir, f), "utf8");
  for (const m of src.matchAll(quotedRe)) referenced.add(basename(m[1]));
}
const missing = [...referenced].filter((f) => !current.has(f));
if (missing.length) throw new Error("Referenced files are not current — aborting: " + missing.join(", "));

if (process.argv[2] === "--delete") {
  let bytes = 0;
  for (const f of stale) { bytes += statSync(join(dir, f)).size; unlinkSync(join(dir, f)); }
  console.log(`kept ${current.size} current chunks, deleted ${stale.length} stale files (${(bytes / 1048576).toFixed(1)} MB)`);
} else {
  console.log(`current: ${current.size} | stale: ${stale.length} (${(stale.reduce((s, f) => s + statSync(join(dir, f)).size, 0) / 1048576).toFixed(1)} MB) — run with --delete to clean`);
}
