const r = await fetch("https://glamiastore.com/", { headers: { "Cache-Control": "no-cache" } });
console.log("via worker URL headers:");
const r2 = await fetch("https://maison-mode-commerce.glamia.workers.dev/", { headers: { "Cache-Control": "no-cache" } });
for (const [key, value] of r.headers) console.log("custom-domain:", key + ":", String(value).slice(0, 60));
console.log("---");
for (const [key, value] of r2.headers) console.log("workers-dev:", key + ":", String(value).slice(0, 60));
