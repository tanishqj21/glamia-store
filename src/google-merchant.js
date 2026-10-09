// Merchant API v1. Only offers owned by this API source are changed or removed.
import { WIBRAWL_ORIGIN } from './storefront-identity.js';
const BASE = 'https://merchantapi.googleapis.com';
const encoder = new TextEncoder();
let cachedToken = { email: '', token: '', until: 0 };
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const issue = (message, status = 400) => Object.assign(new Error(message), { status });
const seconds = () => Math.floor(Date.now() / 1000);
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');

export function merchantConfig(env) {
  const reuse = env.MERCHANT_USE_GA4_SERVICE_ACCOUNT === 'true';
  const service = parse(env.MERCHANT_SERVICE_ACCOUNT_JSON || (reuse ? env.GA4_SERVICE_ACCOUNT_JSON : '') || '{}', {});
  const email = String(env.MERCHANT_CLIENT_EMAIL || service.client_email || (reuse ? env.GA4_CLIENT_EMAIL : '') || '').trim();
  const key = String(env.MERCHANT_PRIVATE_KEY || service.private_key || (reuse ? env.GA4_PRIVATE_KEY : '') || '').replace(/\\n/g, '\n');
  const account = String(env.MERCHANT_ACCOUNT_ID || '').trim();
  const sourceId = String(env.MERCHANT_DATA_SOURCE_ID || '').trim();
  const missing = [];
  if (!/^\d+$/.test(account)) missing.push('MERCHANT_ACCOUNT_ID');
  if (!/^\d+$/.test(sourceId)) missing.push('MERCHANT_DATA_SOURCE_ID');
  if (!email) missing.push('MERCHANT_CLIENT_EMAIL');
  if (!key) missing.push('MERCHANT_PRIVATE_KEY');
  return { email, key, account, source: `accounts/${account}/dataSources/${sourceId}`, enabled: env.MERCHANT_SYNC_ENABLED === 'true', configured: !missing.length, missing };
}

async function token(config) {
  if (cachedToken.email === config.email && cachedToken.until > Date.now()) return cachedToken.token;
  const now = seconds();
  const head = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(encoder.encode(JSON.stringify({ iss: config.email, scope: 'https://www.googleapis.com/auth/content', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const der = Uint8Array.from(atob(config.key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(`${head}.${claims}`))));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw issue('Google service account authentication failed. Check its key and access.', 502);
  cachedToken = { email: config.email, token: data.access_token, until: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 120) * 1000 };
  return data.access_token;
}

async function google(config, path, method = 'GET', body) {
  const response = await fetch(`${BASE}/${path}`, { method, headers: { Authorization: `Bearer ${await token(config)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    if (response.status === 401) cachedToken.until = 0;
    throw issue(`Google ${response.status}: ${String(data.error?.message || 'Merchant API request failed').slice(0, 1500)}`, response.status);
  }
  return data;
}

export async function merchantOffers(product, sizes, metadata, helpers, now = Date.now()) {
  if (!product || product.status !== 'live' || metadata.isSample === true) return [];
  const p = product;
  const origin = p.storefront_visibility === 'wibrawl' ? WIBRAWL_ORIGIN : 'https://glamiastore.com';
  const imageValues = parse(p.images_json || '[]', []);
  const images = [...new Set([...(Array.isArray(imageValues) ? imageValues : []), p.image_url].filter(Boolean).map(value => new URL(value, origin).href))];
  if (!p.name || !p.description || !images.length || !Number.isFinite(Number(helpers.price(p))) || !(Number(helpers.price(p)) > 0)) throw issue('Add a product title, description, image and valid price before Google submission.');
  if (images.some(value => !value.startsWith('https://'))) throw issue('Google product images must use HTTPS.');
  const entries = sizes.length ? sizes : [{ size: '', stock: Number(p.stock) || 0 }];
  const declaredSizes = parse(p.sizes_json || '[]', []);
  if (!sizes.length && declaredSizes.length) throw issue('Size-level inventory is missing. Save the product sizes before Google submission.');
  const gender = metadata.gender || (/^women$/i.test(p.category) ? 'FEMALE' : /^men$/i.test(p.category) ? 'MALE' : undefined);
  const ageGroup = metadata.ageGroup || (/^(men|women)$/i.test(p.category) ? 'ADULT' : undefined);
  const groupId = `g${(await hash(String(p.variant_group || p.id))).slice(0, 32)}`;
  const productTitle = String(p.name).trim();
  const colorInTitle = p.color && productTitle.toLocaleLowerCase('en').endsWith(String(p.color).trim().toLocaleLowerCase('en'));
  const result = [];
  for (const entry of entries) {
    const offerId = `g${(await hash(`${p.id}\n${entry.size}`)).slice(0, 40)}`;
    const link = new URL(helpers.path(p), origin);
    if (entry.size) link.searchParams.set('size', entry.size);
    const isPreorder = Boolean(Number(p.preorder_enabled));
    const canPreorder = isPreorder && Number(p.preorder_limit) > Number(p.preorder_sold || 0);
    const release = Date.parse(p.preorder_release_at || '');
    if (canPreorder && (!Number.isFinite(release) || release <= now)) throw issue('Preorders need a future availability date for Google.');
    const attributes = {
      title: [productTitle, colorInTitle ? null : p.color, entry.size].filter(Boolean).join(' — ').slice(0, 150),
      description: String(p.description).slice(0, 5000), link: link.href,
      imageLink: images[0], additionalImageLinks: images.slice(1, 11),
      price: { amountMicros: String(Math.round(Number(helpers.price(p)) * 1000000)), currencyCode: 'INR' },
      ...(Number(p.mrp) >= Number(helpers.price(p)) ? { maximumRetailPrice: { amountMicros: String(Math.round(Number(p.mrp) * 1000000)), currencyCode: 'INR' } } : {}),
      availability: isPreorder ? (canPreorder ? 'PREORDER' : 'OUT_OF_STOCK') : Number(entry.stock) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      ...(canPreorder ? { availabilityDate: new Date(release).toISOString() } : {}),
      condition: 'NEW', brand: p.brand || 'Glamia',
      ...(p.color ? { color: p.color } : {}), ...(p.material ? { material: p.material } : {}),
      ...(entry.size ? { size: String(entry.size) } : {}),
      ...(gender ? { gender } : {}), ...(ageGroup ? { ageGroup } : {}),
      itemGroupId: groupId, productTypes: [[p.category, p.subcategory].filter(Boolean).join(' > ')],
      returns: [{ countries: ['IN'], policyUrl: `${origin}/return-policy`, windowType: Number(p.returnable) ? 'FINITE_RETURN_WINDOW' : 'NO_RETURNS', ...(Number(p.returnable) ? { windowDays: '7', itemConditions: ['NEW'], methods: ['BY_MAIL'], outcomes: ['REFUND', 'EXCHANGE'] } : {}) }],
      ...(metadata.mpn ? { mpn: metadata.mpn } : {}),
      ...(metadata.gtins?.[entry.size || 'default'] ? { gtins: [metadata.gtins[entry.size || 'default']] } : {}),
      ...(metadata.identifierExists === false ? { identifierExists: false } : {})
    };
    const input = { offerId, contentLanguage: 'en', feedLabel: 'IN', productAttributes: attributes };
    result.push({ input, fingerprint: await hash(JSON.stringify(input)) });
  }
  return result;
}

const enqueueSql = `INSERT INTO merchant_sync_queue(product_id) VALUES(?) ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, attempts=0, next_attempt_at=unixepoch(), last_error=NULL`;
async function desired(env, id, helpers) {
  const product = await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
  const sizes = product ? (await env.DB.prepare('SELECT size, stock FROM product_sizes WHERE product_id=? ORDER BY size').bind(id).all()).results : [];
  const details = await env.DB.prepare('SELECT metadata_json FROM merchant_product_details WHERE product_id=?').bind(id).first();
  return merchantOffers(product, sizes, parse(details?.metadata_json || '{}', {}), helpers);
}

async function enqueueRefresh(env) {
  // Re-evaluate time-based prices every five minutes; refresh Google inputs before 30-day expiry.
  await env.DB.prepare(`INSERT INTO merchant_sync_queue(product_id)
    SELECT p.id FROM products p WHERE p.status='live' AND (p.deal_price>0 OR EXISTS(
      SELECT 1 FROM merchant_sync_offers o WHERE o.product_id=p.id AND o.submitted_at<unixepoch()-1728000))
    ON CONFLICT(product_id) DO NOTHING`).run();
}

async function ensureDeveloperRegistration(config, env) {
  const registered = await google(config, 'accounts/v1/accounts:getAccountForGcpRegistration').catch(error => {
    if (error.status === 404 || (error.status === 401 && /not registered with the merchant account/i.test(error.message))) return null;
    throw error;
  });
  if (registered?.name === `accounts/${config.account}`) return;
  if (registered?.name) throw issue(`Google Cloud project is registered to ${registered.name}, not Glamia.`, 409);
  const email = String(env.MERCHANT_DEVELOPER_EMAIL || '').trim();
  if (!email) throw issue('Set MERCHANT_DEVELOPER_EMAIL to the Google account of the developer contact.');
  await google(config, `accounts/v1/accounts/${config.account}/developerRegistration:registerGcp`, 'POST', { developerEmail: email });
}

export async function processMerchantSync(env, helpers) {
  const config = merchantConfig(env);
  if (!config.enabled || !config.configured) return { skipped: true, missing: config.missing };
  const owner = crypto.randomUUID();
  const locked = await env.DB.prepare('UPDATE merchant_sync_control SET lease_owner=?, lease_until=unixepoch()+120 WHERE id=1 AND lease_until<unixepoch()').bind(owner).run();
  if (!locked.meta.changes) return { busy: true };
  const deadline = Date.now() + 18000;
  let processed = 0;
  let lastError = null;
  try {
    await ensureDeveloperRegistration(config, env);
    await enqueueRefresh(env);
    const queue = (await env.DB.prepare('SELECT * FROM merchant_sync_queue WHERE next_attempt_at<=unixepoch() ORDER BY queued_at LIMIT 15').all()).results;
    for (const event of queue) {
      if (Date.now() > deadline) break;
      try {
        const offers = await desired(env, event.product_id, helpers);
        const existing = (await env.DB.prepare('SELECT * FROM merchant_sync_offers WHERE product_id=? AND source_name=?').bind(event.product_id, config.source).all()).results;
        for (const offer of offers) {
          if (Date.now() > deadline) throw issue('Sync will continue on the next scheduled run.');
          const prior = existing.find(x => x.offer_id === offer.input.offerId);
          if (prior?.fingerprint === offer.fingerprint && prior.submitted_at > seconds() - 1728000) continue;
          await google(config, `products/v1/accounts/${config.account}/productInputs:insert?dataSource=${encodeURIComponent(config.source)}`, 'POST', offer.input);
          await env.DB.prepare(`INSERT INTO merchant_sync_offers(source_name,offer_id,product_id,fingerprint,submitted_at) VALUES(?,?,?,?,unixepoch())
            ON CONFLICT(source_name,offer_id) DO UPDATE SET fingerprint=excluded.fingerprint,submitted_at=excluded.submitted_at,checked_at=0,status_json=NULL`).bind(config.source, offer.input.offerId, event.product_id, offer.fingerprint).run();
        }
        for (const prior of existing.filter(x => !offers.some(o => o.input.offerId === x.offer_id))) {
          if (Date.now() > deadline) throw issue('Sync will continue on the next scheduled run.');
          try { await google(config, `products/v1/accounts/${config.account}/productInputs/en~IN~${prior.offer_id}?dataSource=${encodeURIComponent(config.source)}`, 'DELETE'); } catch (error) { if (error.status !== 404) throw error; }
          await env.DB.prepare('DELETE FROM merchant_sync_offers WHERE source_name=? AND offer_id=?').bind(config.source, prior.offer_id).run();
        }
        // A stock or listing edit arriving during the request retains its newer revision.
        await env.DB.prepare('DELETE FROM merchant_sync_queue WHERE product_id=? AND revision=?').bind(event.product_id, event.revision).run();
        processed++;
      } catch (error) {
        if (error.message === 'Sync will continue on the next scheduled run.') {
          await env.DB.prepare('UPDATE merchant_sync_queue SET next_attempt_at=unixepoch(),last_error=NULL WHERE product_id=? AND revision=?').bind(event.product_id, event.revision).run();
          break;
        }
        lastError = String(error.message).slice(0, 1800);
        await env.DB.prepare('UPDATE merchant_sync_queue SET attempts=attempts+1,next_attempt_at=unixepoch()+?,last_error=? WHERE product_id=? AND revision=?').bind(Math.min(21600, 60 * 2 ** Math.min(Number(event.attempts), 9)), lastError, event.product_id, event.revision).run();
      }
    }
    const pending = (await env.DB.prepare('SELECT offer_id,product_id,submitted_at FROM merchant_sync_offers WHERE source_name=? AND checked_at<unixepoch()-21600 ORDER BY checked_at LIMIT 5').bind(config.source).all()).results;
    for (const offer of pending) {
      if (Date.now() > deadline) break;
      try {
        const data = await google(config, `products/v1/accounts/${config.account}/products/en~IN~${offer.offer_id}`);
        const status = data.productStatus || {};
        const googleUpdated = Date.parse(status.lastUpdateDate || '');
        const stale = !Number.isFinite(googleUpdated) || googleUpdated < offer.submitted_at * 1000 - 1000;
        await env.DB.prepare('UPDATE merchant_sync_offers SET checked_at=unixepoch()-?,status_json=? WHERE source_name=? AND offer_id=?').bind(stale ? 21500 : 0, JSON.stringify(status), config.source, offer.offer_id).run();
      } catch (error) {
        // A just-inserted product may not be available yet. Keep polling it later.
        if (error.status === 404 && offer.submitted_at < seconds() - 600) {
          await env.DB.batch([
            env.DB.prepare('UPDATE merchant_sync_offers SET submitted_at=0 WHERE source_name=? AND offer_id=?').bind(config.source, offer.offer_id),
            env.DB.prepare(enqueueSql).bind(offer.product_id)
          ]);
        } else if (error.status !== 404) lastError = String(error.message).slice(0, 1800);
      }
    }
  } catch (error) { lastError = String(error.message).slice(0, 1800); }
  finally { await env.DB.prepare('UPDATE merchant_sync_control SET lease_until=0,lease_owner=NULL,last_run_at=unixepoch(),last_error=? WHERE id=1 AND lease_owner=?').bind(lastError, owner).run(); }
  return { processed, error: lastError };
}

export function scheduleMerchantSync(env, ctx, helpers) {
  if (merchantConfig(env).enabled) ctx.waitUntil(processMerchantSync(env, helpers).catch(error => console.error('Merchant sync failed:', error.message)));
}

export async function merchantAdmin(request, env, url, ctx, helpers) {
  const config = merchantConfig(env);
  const action = url.pathname.slice('/api/admin/google-merchant'.length);
  const response = data => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  if (request.method === 'GET' && !action) {
    const [queue, offers, control, failures, statuses] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM merchant_sync_queue').first(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM merchant_sync_offers WHERE source_name=?').bind(config.source).first(),
      env.DB.prepare('SELECT last_run_at,last_error FROM merchant_sync_control WHERE id=1').first(),
      env.DB.prepare('SELECT q.*,p.name FROM merchant_sync_queue q LEFT JOIN products p ON p.id=q.product_id WHERE last_error IS NOT NULL ORDER BY next_attempt_at LIMIT 20').all(),
      env.DB.prepare('SELECT o.offer_id,o.product_id,o.submitted_at,o.checked_at,o.status_json,p.name FROM merchant_sync_offers o LEFT JOIN products p ON p.id=o.product_id WHERE source_name=? ORDER BY submitted_at DESC LIMIT 30').bind(config.source).all()
    ]);
    return response({ enabled: config.enabled, configured: config.configured, missing: config.missing, account: config.account, source: config.source, serviceAccount: config.email, queued: queue.count, submitted: offers.count, control, failures: failures.results, offers: statuses.results.map(o => ({ ...o, status: parse(o.status_json || '{}', {}) })) });
  }
  if (request.method === 'GET' && action.startsWith('/preview/')) return response({ offers: await desired(env, decodeURIComponent(action.slice(9)), helpers) });
  if (request.method === 'POST' && action === '/sync') {
    await env.DB.prepare(`INSERT INTO merchant_sync_queue(product_id) SELECT id FROM products WHERE status='live'
      ON CONFLICT(product_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=unixepoch(),last_error=NULL`).run();
    scheduleMerchantSync(env, ctx, helpers);
    return response({ queued: true, enabled: config.enabled });
  }
  if (request.method === 'POST' && action === '/verify') {
    if (!config.configured) throw issue(`Missing configuration: ${config.missing.join(', ')}`);
    const source = await google(config, `datasources/v1/${config.source}`);
    if (source.input !== 'API') throw issue('Choose an API data source in Merchant Center.');
    return response({ connected: true, source: source.name, displayName: source.displayName });
  }
  if (request.method === 'POST' && action === '/register') {
    if (!config.configured) throw issue(`Missing configuration: ${config.missing.join(', ')}`);
    const email = String(env.MERCHANT_DEVELOPER_EMAIL || '').trim();
    if (!email) throw issue('Set MERCHANT_DEVELOPER_EMAIL to the Google account of the developer contact.');
    return response(await google(config, `accounts/v1/accounts/${config.account}/developerRegistration:registerGcp`, 'POST', { developerEmail: email }));
  }
  if (request.method === 'PUT' && action.startsWith('/details/')) {
    const id = decodeURIComponent(action.slice(9));
    if (!(await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first())) throw issue('Product not found', 404);
    const raw = await request.text();
    if (raw.length > 16000) throw issue('Product metadata is too large', 413);
    const data = parse(raw, null);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw issue('Provide product metadata as an object.');
    const existing = await env.DB.prepare('SELECT metadata_json FROM merchant_product_details WHERE product_id=?').bind(id).first();
    const metadata = {};
    // Ordinary Google metadata edits must not turn a preview into a real offer.
    if (data.isSample !== undefined && typeof data.isSample !== 'boolean') throw issue('Sample listing flag must be true or false.');
    const isSample = data.isSample === undefined ? parse(existing?.metadata_json || '{}', {}).isSample : data.isSample;
    if (isSample === true) metadata.isSample = true;
    if (data.gender) { if (!['MALE', 'FEMALE', 'UNISEX'].includes(data.gender)) throw issue('Invalid gender'); metadata.gender = data.gender; }
    if (data.ageGroup) { if (!['ADULT', 'KIDS', 'TODDLER', 'INFANT', 'NEWBORN'].includes(data.ageGroup)) throw issue('Invalid age group'); metadata.ageGroup = data.ageGroup; }
    if (data.mpn) metadata.mpn = String(data.mpn).trim().slice(0, 70);
    if (data.identifierExists === false) metadata.identifierExists = false;
    if (data.gtins) {
      if (typeof data.gtins !== 'object' || Array.isArray(data.gtins)) throw issue('GTINs must map each size to its barcode.');
      metadata.gtins = {};
      for (const [size, gtin] of Object.entries(data.gtins)) {
        if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(String(gtin))) throw issue('GTINs must contain 8, 12, 13 or 14 digits.');
        metadata.gtins[size] = String(gtin);
      }
    }
    if (metadata.identifierExists === false && (metadata.mpn || Object.keys(metadata.gtins || {}).length)) throw issue('Products with identifiers cannot be marked as having no identifiers.');
    await env.DB.batch([env.DB.prepare('INSERT INTO merchant_product_details(product_id,metadata_json) VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET metadata_json=excluded.metadata_json').bind(id, JSON.stringify(metadata)), env.DB.prepare(enqueueSql).bind(id)]);
    scheduleMerchantSync(env, ctx, helpers);
    return response({ saved: true });
  }
  throw issue('Merchant sync endpoint not found', 404);
}
