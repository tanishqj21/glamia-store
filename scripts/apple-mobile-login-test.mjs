// Exercise the browser handoff without calling Apple or touching production data.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8788";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Apple auth tests require the isolated local Worker.");

async function post(path, data, headers = {}) {
  return fetch(`${base}${path}`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", Origin: base, "X-Requested-With": "Glamia", ...headers }, body: JSON.stringify(data) });
}

const configuration = await (await fetch(`${base}/api/auth/apple/mobile/config`)).json();
assert.equal(configuration.available, true, "Set APPLE_SERVICE_ID on the isolated local Worker");

const badStart = await post("/api/auth/apple/mobile/start", { verifier_hash: "not-a-hash" });
assert.equal(badStart.status, 400);

async function begin() {
  const verifier = randomBytes(32).toString("hex");
  const verifierHash = createHash("sha256").update(verifier).digest("hex");
  const response = await post("/api/auth/apple/mobile/start", { verifier_hash: verifierHash });
  assert.equal(response.status, 200);
  const flow = await response.json();
  const authorization = new URL(flow.authorization_url);
  assert.equal(authorization.origin, "https://appleid.apple.com");
  assert.equal(authorization.searchParams.get("client_id"), "com.glamia.store.web");
  assert.equal(authorization.searchParams.get("redirect_uri"), "https://glamiastore.com/api/auth/apple/mobile/callback");
  assert.equal(authorization.searchParams.get("response_type"), "code id_token");
  assert.equal(authorization.searchParams.get("response_mode"), "form_post");
  assert.ok(authorization.searchParams.get("nonce"));
  return { state: authorization.searchParams.get("state"), verifier };
}

const cancelled = await begin();
const cancelledResponse = await fetch(`${base}/api/auth/apple/mobile/callback`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://appleid.apple.com" }, body: new URLSearchParams({ state: cancelled.state, error: "user_cancelled_authorize" }) });
assert.equal(cancelledResponse.status, 303);
assert.equal(new URL(cancelledResponse.headers.get("location")).searchParams.get("error"), "cancelled");
assert.equal(cancelledResponse.headers.get("referrer-policy"), "no-referrer");

const replay = await fetch(`${base}/api/auth/apple/mobile/callback`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://appleid.apple.com" }, body: new URLSearchParams({ state: cancelled.state, error: "user_cancelled_authorize" }) });
assert.equal(replay.status, 401);

const invalidToken = await begin();
const forged = await fetch(`${base}/api/auth/apple/mobile/callback`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://appleid.apple.com" }, body: new URLSearchParams({ state: invalidToken.state, id_token: "not-a-token" }) });
assert.equal(forged.status, 401);

const unknownTicket = await post("/api/auth/apple/mobile/exchange", { ticket: `${randomUUID()}${randomUUID()}`, verifier: invalidToken.verifier });
assert.equal(unknownTicket.status, 401);

console.log("Apple browser start, state, cancellation, replay, forged token, and ticket checks passed.");
