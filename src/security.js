// Remove business-only fields before returning a product to a public client.
export function publicProductView(product) {
  const result = { ...product };
  for (const key of ["seller_email", "cost_price", "reorder_point", "image_key", "image_keys", "thumbnail_key", "thumbnail_keys"]) delete result[key];
  if (Array.isArray(result.variants)) result.variants = result.variants.map(publicProductView);
  return result;
}

// An employee may delegate only permissions already granted to their account.
export function canDelegatePermissions(actor, requested) {
  return Object.entries(requested).every(([key, enabled]) => !enabled || actor[key] === true);
}

// Owners alone assign admin rank; employee managers cannot manage higher-ranked accounts.
export function canManageEmployee(actor, target, requestedPermissions = target?.permissions || {}, nextPosition = target?.position) {
  if (actor?.is_owner === true) return true;
  if (!actor?.employee_id || actor.employee_permissions?.employees !== true) return false;
  if (target?.is_owner || target?.position === "admin" || nextPosition === "admin") return false;
  const rank = { packing_staff: 1, customer_relationship: 2, inventory_manager: 2, manager: 3, admin: 4 };
  const actorRank = rank[actor.employee_position] || 1;
  if ((rank[target?.position] || 1) > actorRank || (rank[nextPosition] || 1) > actorRank) return false;
  return canDelegatePermissions(actor.employee_permissions, target?.permissions || {})
    && canDelegatePermissions(actor.employee_permissions, requestedPermissions);
}

// Reject malformed or unversioned production sessions before querying an account.
export function validSessionClaims(payload, maxAge, allowLegacy = false, now = Math.floor(Date.now() / 1000)) {
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload)
    && typeof payload.email === "string" && payload.email.length <= 254 && payload.email.includes("@")
    && Number.isSafeInteger(payload.iat) && payload.iat > 0 && payload.iat <= now + 300
    && Number.isSafeInteger(payload.exp) && payload.exp > now && payload.exp > payload.iat && payload.exp - payload.iat <= maxAge
    && (payload.nbf === undefined || (Number.isSafeInteger(payload.nbf) && payload.nbf <= now + 300))
    && ((allowLegacy && payload.sv === undefined) || (Number.isSafeInteger(payload.sv) && payload.sv >= 0)));
}

// Bound streamed request bodies as well as requests with a Content-Length header.
export async function readBoundedBody(request, maxBytes) {
  const tooLarge = () => Object.assign(new Error("Request body is too large"), { status: 413 });
  if (Number(request.headers.get("Content-Length")) > maxBytes) throw tooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
