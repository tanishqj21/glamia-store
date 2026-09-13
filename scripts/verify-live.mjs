import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const live = readFileSync(join(tmpdir(), "live-index.html"), "utf8");
const local = readFileSync("public/index.html", "utf8");
const liveJs = (live.match(/assets\/index-[^"]+\.js/g) || [])[0];
const liveCss = (live.match(/assets\/index-[^"]+\.css/g) || [])[0];
const localJs = (local.match(/assets\/index-[^"]+\.js/g) || [])[0];
const localCss = (local.match(/assets\/index-[^"]+\.css/g) || [])[0];
console.log("live  js:", liveJs, "| css:", liveCss);
console.log("local js:", localJs, "| css:", localCss);
console.log("index.html match:", live === local ? "YES" : "NO");
const localBundle = readFileSync("public/" + localJs, "utf8");
console.log("new bundle has search suggestions:", localBundle.includes("search-suggest-panel"));
console.log("new bundle has slug url helper:", localBundle.includes("Find your next edit") && localBundle.includes("menu-top"));
