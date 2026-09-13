const origin = "https://glamiastore.com";
const productUrl = origin + "/product/night-suit-sage-green";

const plain = await (await fetch(productUrl)).text();
const bot = await (await fetch(productUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } })).text();
const home = await (await fetch(origin + "/")).text();
const category = await (await fetch(origin + "/category/Women")).text();
const asset = await fetch(origin + "/favicon.svg");

const grab = (html, pattern) => (html.match(pattern) || [])[1] || "(missing)";

const checks = {
  "— REGULAR VISITOR (product page) —": "",
  "title": grab(plain, /<title>([^<]+)<\/title>/),
  "meta description": grab(plain, /<meta name="description" content="([^"]{0,60})/),
  "og:title": grab(plain, /<meta property="og:title" content="([^"]{0,50})/),
  "og:image present": plain.includes("og:image"),
  "twitter:card": grab(plain, /<meta name="twitter:card" content="([^"]+)/),
  "canonical": grab(plain, /<link rel="canonical" href="([^"]+)/),
  "JSON-LD Product": plain.includes('"@type":"Product"'),
  "JSON-LD price": grab(plain, /"price":(\d+)/),
  "— GOOGLEBOT (same product) —": "",
  "server-rendered h1": grab(bot, /<h1>([^<]+)<\/h1>/),
  "server-rendered price": bot.includes("detail-price") && grab(bot, /detail-price">([^<]{0,30})/),
  "splash removed for bots": !bot.includes("initial-loader"),
  "root has content for bots": !bot.includes('<div id="root"></div>'),
  "— OTHER ROUTES —": "",
  "home og:title": grab(home, /<meta property="og:title" content="([^"]{0,40})/),
  "category title": grab(category, /<title>([^<]+)<\/title>/),
  "favicon still served": asset.status,
};

for (const [key, value] of Object.entries(checks)) console.log(key.padEnd(32), ":", value);
