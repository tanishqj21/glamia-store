// Exercise the web handoff against the isolated local Worker without Apple credentials.
import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8788";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Apple web tests require the isolated local Worker.");

const config = await (await fetch(`${base}/api/config`)).json();
assert.equal(config.appleWebAvailable, true, "Supply isolated test Apple settings to the local Worker");

async function begin() {
  const response = await fetch(`${base}/api/auth/apple/web/start`, { redirect: "manual" });
  assert.equal(response.status, 303);
  const authorize = new URL(response.headers.get("location"));
  assert.equal(authorize.origin, "https://appleid.apple.com");
  assert.equal(authorize.searchParams.get("client_id"), "com.glamia.store.web");
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://glamiastore.com/api/auth/apple/web/callback");
  assert.equal(authorize.searchParams.get("response_type"), "code id_token");
  assert.equal(authorize.searchParams.get("response_mode"), "form_post");
  assert.ok(authorize.searchParams.get("nonce"));
  assert.match(response.headers.get("set-cookie"), /__Host-glamia_apple_flow=.*HttpOnly; Secure; SameSite=None/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  return { state: authorize.searchParams.get("state"), cookie: response.headers.get("set-cookie").split(";")[0] };
}

async function callback(form, cookie = "") {
  return fetch(`${base}/api/auth/apple/web/callback`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://appleid.apple.com", ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(form)
  });
}

const missingCookie = await begin();
assert.equal((await callback({ state: missingCookie.state, error: "user_cancelled_authorize" })).headers.get("location"), "/login?apple_error=failed");

const cancelled = await begin();
const result = await callback({ state: cancelled.state, error: "user_cancelled_authorize" }, cancelled.cookie);
assert.equal(result.status, 303);
assert.equal(result.headers.get("location"), "/login?apple_error=cancelled");
assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
assert.equal((await callback({ state: cancelled.state, error: "user_cancelled_authorize" }, cancelled.cookie)).headers.get("location"), "/login?apple_error=failed");

const forged = await begin();
assert.equal((await callback({ state: forged.state, code: "invalid-code" }, cancelled.cookie)).headers.get("location"), "/login?apple_error=failed");
assert.equal((await callback({ state: forged.state, code: "invalid-code" }, forged.cookie)).headers.get("location"), "/login?apple_error=failed");
assert.equal((await callback({ state: forged.state, code: "invalid-code" }, forged.cookie)).headers.get("location"), "/login?apple_error=failed");

console.log("Apple web config, start, browser binding, cancellation, replay, and forged-code checks passed.");
