// Verify the complete build graph before archiving obsolete generated chunks.
import { readFileSync, readdirSync, statSync, mkdirSync, renameSync } from "node:fs";
import { resolve, relative, basename, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = resolve(root, "public");
const assetsDir = resolve(publicDir, "assets");
const manifest = JSON.parse(readFileSync(resolve(publicDir, ".vite/manifest.json"), "utf8"));
const html = readFileSync(resolve(publicDir, "index.html"), "utf8");
const referenced = new Set();

// Resolve every candidate inside the expected directory before any filesystem mutation.
function inside(directory, name) {
  const path = resolve(directory, name);
  const rel = relative(directory, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Unsafe asset path: ${name}`);
  return path;
}

for (const entry of Object.values(manifest)) {
  for (const imported of [...(entry.imports || []), ...(entry.dynamicImports || [])]) {
    if (!manifest[imported]) throw new Error(`Missing manifest dependency: ${imported}`);
  }
  for (const file of [entry.file, ...(entry.css || []), ...(entry.assets || [])].filter(Boolean)) {
    if (!statSync(inside(publicDir, file)).isFile()) throw new Error(`Missing built asset: ${file}`);
    if (file.startsWith("assets/")) referenced.add(file.slice(7));
  }
}
const htmlAssets = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"?#]+)/g)].map(match => match[1].slice(7));
if (!htmlAssets.length || !Object.values(manifest).some(entry => entry.isEntry)) throw new Error("No build entry found; refusing cleanup.");
for (const file of htmlAssets) if (!referenced.has(file)) throw new Error(`HTML references an asset outside this build: ${file}`);

// Preserve a seven-day compatibility window for already-open tabs and lazy-loaded routes.
const cutoff = Date.now() - 7 * 86400000;
// Checkout mtimes are fresh even for obsolete bundles. Keep every asset referenced
// by a manifest committed during the compatibility window, using Git as evidence.
let tracked = null, recentlyReferenced = null;
try {
  tracked = new Set(execFileSync('git', ['ls-files', 'public/assets'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).map(path => basename(path)));
  const history = execFileSync('git', ['log', '--since=' + new Date(cutoff).toISOString(), '--format=', '-p', '--', 'public/.vite/manifest.json'], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  recentlyReferenced = new Set([...history.matchAll(/assets\/([\w-]+-[\w-]{8}\.(?:js|css))/g)].map(match => match[1]));
} catch { /* Outside a Git checkout, retain the conservative mtime policy. */ }
const stale = readdirSync(assetsDir).filter(file => /^[\w-]+-[\w-]{8}\.(js|css)$/.test(file)
  && !referenced.has(file) && (tracked?.has(file)
    ? !recentlyReferenced.has(file)
    : statSync(inside(assetsDir, file)).mtimeMs < cutoff));
if (process.argv.includes("--delete")) throw new Error("Destructive cleanup was removed; use --archive instead.");
if (process.argv.includes("--archive") && stale.length) {
  const archive = inside(resolve(root, "tmp"), `asset-archive-${Date.now()}`);
  mkdirSync(archive, { recursive: true });
  for (const file of stale) renameSync(inside(assetsDir, file), inside(archive, basename(file)));
  console.log(`Verified ${referenced.size} current chunks; archived ${stale.length} obsolete chunks in ${archive}. Recent chunks remain for existing tabs.`);
} else console.log(`Verified ${referenced.size} current chunks; ${stale.length} obsolete chunks can be archived with --archive.`);
