// Render the current Expo Go URL from the running packager, never a guessed LAN address.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const [app = "glamia-packer-app", port = "8082", filename = "employees-tunnel-qr.png"] = process.argv.slice(2);
assert.ok(["glamia-packer-app", "glamia-shoppers-app"].includes(app));
assert.match(port, /^\d{4,5}$/);
assert.match(filename, /^[a-z0-9-]+\.png$/);
const root = fileURLToPath(new URL("../", import.meta.url));
const appRoot = path.join(root, app);
const response = await fetch(`http://127.0.0.1:${port}/_expo/open?platform=android&runtime=expo`);
assert.ok(response.ok, "Expo preview is not running");
const link = await response.json();
assert.equal(link.runtime, "expo");
assert.match(link.url, /^exp(s)?:\/\//);
const expoRequire = createRequire(path.join(appRoot, "node_modules/expo/node_modules/@expo/cli/build/src/utils/qr.js"));
const matrix = expoRequire("toqr").toQR(link.url);
const extent = Math.sqrt(matrix.length);
assert.ok(Number.isInteger(extent));
const padding = 4;
const size = extent + padding * 2;
const pixels = Array.from(matrix, (black, index) => black ? `<rect x="${index % extent + padding}" y="${Math.floor(index / extent) + padding}" width="1" height="1"/>` : "").join("");
const destination = path.join(appRoot, ".expo", filename);
await mkdir(path.dirname(destination), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: size * 12, height: size * 12 } });
  await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${size * 12}" height="${size * 12}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><g fill="black">${pixels}</g></svg></body></html>`);
  await page.locator("svg").screenshot({ path: destination });
  console.log(JSON.stringify({ url: link.url, appId: link.appId, qr: destination }));
} finally { await browser.close(); }
