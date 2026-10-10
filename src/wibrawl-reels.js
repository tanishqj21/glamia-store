export const WIBRAWL_REEL_DEFAULTS = [
  { id: 'filmstrip', layout: 'filmstrip', visible: true, eyebrow: 'The Wibrawl edit', title: 'GOOD TEES.', emphasis: 'GREAT ENERGY.', description: 'A closer look at the pieces. Swipe through, find your vibe.', product_ids: [] },
  { id: 'spotlight', layout: 'spotlight', visible: true, eyebrow: 'In the spotlight', title: 'ONE PIECE.', emphasis: 'ALL YOU.', description: 'Give your next favourite a little screen time.', product_ids: [] },
  { id: 'lookbook', layout: 'lookbook', visible: true, eyebrow: 'The lookbook', title: 'MIX IT UP.', emphasis: 'MAKE IT YOURS.', description: 'Different moods. Your own way to wear them.', product_ids: [] }
];

// One complete ordered document keeps visibility and ordering atomic.
export function normalizeWibrawlReels(value, strict = false) {
  const fail = () => { throw new Error('Submit all three reel styles once, with valid visibility, copy and product selections'); };
  if (strict && (!Array.isArray(value) || value.length !== 3 || new Set(value.map(item => item?.id)).size !== 3)) fail();
  const source = Array.isArray(value) ? value : WIBRAWL_REEL_DEFAULTS;
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const defaults = WIBRAWL_REEL_DEFAULTS.find(reel => reel.id === item?.id);
    if (!defaults || seen.has(item.id)) { if (strict) fail(); continue; }
    seen.add(item.id);
    if (strict && (item.layout !== defaults.layout || typeof item.visible !== 'boolean' || !Array.isArray(item.product_ids) || item.product_ids.length > 8 || item.product_ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 100))) fail();
    const reel = { ...defaults, visible: item.visible === undefined ? defaults.visible : item.visible === true };
    for (const [field, max] of [['eyebrow', 70], ['title', 100], ['emphasis', 100], ['description', 180]]) {
      if (strict && (typeof item[field] !== 'string' || item[field].trim().length > max || (field === 'title' && !item[field].trim()))) fail();
      reel[field] = typeof item[field] === 'string' ? item[field].trim().slice(0, max) : defaults[field];
    }
    reel.product_ids = [...new Set((Array.isArray(item.product_ids) ? item.product_ids : []).filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))].slice(0, 8);
    result.push(reel);
  }
  for (const defaults of WIBRAWL_REEL_DEFAULTS) if (!seen.has(defaults.id)) result.push({ ...defaults, product_ids: [] });
  return result;
}
