const r = await fetch("https://glamiastore.com/", { headers: { "Cache-Control": "no-cache" } });
const csp = r.headers.get("content-security-policy") || "(missing)";
console.log("status:", r.status);
console.log("csp has sha256:", csp.includes("sha256-On1TqejLHzYPtlgCG4EQtHKn2f1u8Plk"));
console.log("csp head:", csp.slice(0, 200));
