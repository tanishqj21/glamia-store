// Read-only capacity audit. Never prints credentials, bindings, or customer data.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const account = '0ba2b427f3776924a9ef3f1b2ef0fc37';
const script = 'maison-mode-commerce';
const paths = [join(homedir(), '.wrangler/config/default.toml'), join(process.env.APPDATA || '', 'xdg.config/.wrangler/config/default.toml')];
const authPath = paths.find(existsSync);
const token = process.env.CLOUDFLARE_API_TOKEN || (authPath && readFileSync(authPath, 'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1]);
if (!token) throw new Error('Existing Wrangler credentials unavailable; no new login attempted.');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
async function api(path, body) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.errors?.length) return { status: response.status, errors: data.errors?.map(error => ({ code: error.code, message: error.message })) || [] };
  return data.result || data.data;
}
const now = new Date();
console.log(JSON.stringify({ capturedAt: now.toISOString() }));
const subscriptions = await api(`/accounts/${account}/subscriptions`);
console.log(JSON.stringify({ subscriptions: Array.isArray(subscriptions) ? subscriptions.map(item => ({ product: item.rate_plan?.id, name: item.rate_plan?.public_name, price: item.price, state: item.state })) : subscriptions }));
const settings = await api(`/accounts/${account}/workers/account-settings`);
console.log(JSON.stringify({ workerAccountSettings: settings }));
const deployment = await api(`/accounts/${account}/workers/scripts/${script}/settings`);
console.log(JSON.stringify({ deployment: deployment?.errors ? deployment : { usage_model: deployment?.usage_model, assets: deployment?.assets && { run_worker_first: deployment.assets.run_worker_first } } }));
const summary = `sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 }`;
for (const [label, start, dimensions] of [
  ['last24Hours', new Date(now - 86400000).toISOString(), 'dimensions { scriptName status }'],
  ['todayUTC', new Date(now.toISOString().slice(0,10) + 'T00:00:00Z').toISOString(), 'dimensions { scriptName status }'],
  ['dailyLast7DaysUTC', new Date(now - 7*86400000).toISOString(), 'dimensions { date scriptName status }'],
]) {
  const query = `query { viewer { accounts(filter: {accountTag: "${account}"}) { workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: "${start}", datetime_leq: "${now.toISOString()}"}) { ${summary} ${dimensions} } } } }`;
  const result = await api('/graphql', { query });
  console.log(JSON.stringify({ label, data: result?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || result }));
}
const yesterday = new Date(now - 86400000).toISOString();
const monthStart = now.toISOString().slice(0,7) + '-01T00:00:00Z';
const r2Query = `query { viewer { accounts(filter: {accountTag: "${account}"}) {
  r2StorageAdaptiveGroups(limit: 1000, filter: {datetime_geq: "${yesterday}", datetime_leq: "${now.toISOString()}"}, orderBy: [datetime_DESC]) { max { payloadSize metadataSize objectCount } dimensions { bucketName datetime } }
  r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: "${monthStart}", datetime_leq: "${now.toISOString()}"}) { sum { requests } dimensions { bucketName actionType actionStatus } }
} } }`;
const r2Result = await api('/graphql', { query: r2Query });
const r2Data = r2Result?.viewer?.accounts?.[0];
const latestBuckets = new Map();
for (const row of r2Data?.r2StorageAdaptiveGroups || []) {
  if (!latestBuckets.has(row.dimensions.bucketName)) latestBuckets.set(row.dimensions.bucketName, row);
}
console.log(JSON.stringify({ label: 'r2CurrentStorageAndMonthToDateOperations', data: r2Data ? { latestStorage: [...latestBuckets.values()], monthToDateOperations: r2Data.r2OperationsAdaptiveGroups } : r2Result }));
