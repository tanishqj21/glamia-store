// Shared specification edits keep the sibling's own colour/name lines.
// Other lines (material, care, etc.) continue to follow the shared edit.
export function linkedSpecificationCopy(specifications, product) {
  const identity = line => {
    const label = line.match(/^\s*(product(?:\s+name)?|name|colou?r(?:way|\s+name)?)\s*:/i)?.[1];
    return label ? (/^colou?r/i.test(label) ? 'colour' : 'product') : null;
  };
  const current = String(product.specifications || '').split(/\r?\n/);
  const own = new Map(current.filter(line => identity(line)).map(line => [identity(line), line]));
  const seen = new Set();
  const lines = String(specifications || '').split(/\r?\n/).map(line => {
    const key = identity(line);
    if (!key) return line;
    seen.add(key);
    return own.get(key) ?? `${line.slice(0, line.indexOf(':') + 1)} ${key === 'colour' ? product.color || '' : product.name || ''}`;
  });
  for (const [key, line] of own) if (!seen.has(key)) lines.push(line);
  return lines.filter(line => line.trim()).join('\n');
}

// Display shared variant copy using the selected product's identity, never a sibling's.
export function selectedVariantCopy(product, colours=[]) {
  const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let description=String(product.description||'');
  if(product.color) {
    for(const colour of [...new Set(colours)].filter(value=>value&&value.toLowerCase()!==product.color.toLowerCase()).sort((a,b)=>b.length-a.length)) {
      description=description.replace(new RegExp(`\\b${escape(colour)}\\b`,'gi'),product.color);
    }
    description=description.replace(/\b(?:rich\s+)?(?:wine|chocolate brown)\s+(?:colou?r|hue|shade)\b/gi,`${product.color} colour`);
  }
  const specifications=String(product.specifications||'').split(/\r?\n/).map(line=>{
    if(/^\s*(?:product|product name|name)\s*:/i.test(line))return `Product: ${product.name}`;
    if(/^\s*(?:colou?r|colou?rway)\s*:/i.test(line))return product.color?`Colour: ${product.color}`:'';
    return line;
  }).filter(Boolean).join('\n');
  return {...product,description,specifications};
}
