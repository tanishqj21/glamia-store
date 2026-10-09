export function customerPromises(raw={}) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  const defaults={dispatch_min:1,dispatch_max:2,delhi_min:2,delhi_max:3,india_min:7,india_max:8,support_hours:48};
  return Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,Number.isInteger(Number(raw[key]))&&Number(raw[key])>=1&&Number(raw[key])<=240?Number(raw[key]):fallback]));
}
export function deliveryPromise(state='',raw={}) {
  const p=customerPromises(raw),delhi=/^(?:new )?delhi(?: nct)?$/i.test(String(state).trim());
  return `Dispatch normally takes ${p.dispatch_min}–${p.dispatch_max} business days; delivery after dispatch normally takes ${delhi?`${p.delhi_min}–${p.delhi_max} business days in Delhi`:`${p.india_min}–${p.india_max} business days elsewhere in India`}. These are estimates, not courier-confirmed dates. Pre-orders follow their stated release date.`;
}
export function shippingPolicyPromise(raw={}) {
  const p=customerPromises(raw);
  return `Dispatch normally takes ${p.dispatch_min}–${p.dispatch_max} business days. After dispatch, delivery normally takes ${p.delhi_min}–${p.delhi_max} business days in Delhi and ${p.india_min}–${p.india_max} business days elsewhere in India. These are estimates, not courier-confirmed dates. Pre-orders follow their stated release date.`;
}
