import { apiFetch } from './api';

// A bounded lookup for explicit bag references. Browsing catalogues remain store-specific.
export async function loadCartProducts(ids, options = {}) {
  const unique = [...new Set(ids.filter(Boolean))], batches = [];
  for (let index = 0; index < unique.length; index += 100) batches.push(unique.slice(index, index + 100));
  const results = await Promise.all(batches.map(async batch => {
    const response = await apiFetch(`/api/products?scope=cart&view=cards&include_stock=1&ids=${batch.map(encodeURIComponent).join(',')}`, options);
    if (!response.ok) throw new Error('Your bag could not be checked. Please try again.');
    return (await response.json()).products || [];
  }));
  return results.flat();
}
