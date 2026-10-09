// One policy source for customer options, support context and submission checks.
export async function purchasedReturnLines(env, orderId) {
  const { results } = await env.DB.prepare(`
    SELECT oi.*, CASE WHEN oi.returnable_snapshot=1 OR a.enabled=1 THEN 1 ELSE 0 END AS eligible_returnable,
      COALESCE(a.enabled,0) AS support_return_enabled, o.items_json AS purchased_products_json,
      p.image_url AS catalog_image, p.color AS catalog_color
    FROM order_items oi JOIN orders o ON o.id=oi.order_id
    LEFT JOIN products p ON p.id=oi.product_id
    LEFT JOIN order_return_access a ON a.order_item_id=oi.id AND a.order_id=oi.order_id
    WHERE oi.order_id=? ORDER BY oi.id
  `).bind(orderId).all();
  return results.map(({purchased_products_json,catalog_image,catalog_color,...line})=>{
    let purchased=[];try{const parsed=JSON.parse(purchased_products_json||'[]');if(Array.isArray(parsed))purchased=parsed;}catch{ /* Legacy order. */ }
    const item=purchased.find(item=>String(item.product_id||item.id)===String(line.product_id)&&String(item.size||'')===String(line.size||''));
    return {...line,image_url:item?.image_url||item?.image||catalog_image||'',color:item?.color||item?.colour||catalog_color||''};
  });
}

export function supportLineReferences(value) {
  try { const refs=JSON.parse(value||'[]'); return Array.isArray(refs)?refs.filter(id=>typeof id==='string'):[]; }
  catch { return []; }
}
