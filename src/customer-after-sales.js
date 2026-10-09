// Allowlisted customer contracts: never serialize staff actors or diagnostics.
export function customerReturnView(row) {
  const keys=['id','order_id','type','reason','status','notes','refund_amount','refund_destination','created_at','updated_at','returned_at','refund_processed_at','credit_approval_status','replacement_order_id','replacement_order_number','replacement_status','replacement_packing_status','replacement_tracking_number','replacement_fulfilment_mode','selected_items_json','logistics_json'];
  const result=Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
  result.case_completed_at=row.case_completed_at||null;
  result.refund_state=row.automatic_refund_error ? 'review_required' : row.refund_state;
  result.label_available=Boolean(row.label_key);
  result.pickup_confirmed_at=row.pickup_confirmed_at||null;
  result.returnStatus=row.pickup_confirmed_at && row.status==='approved' ? 'PICKED_UP_BY_COURIER' : String(row.status).toUpperCase();
  let logistics={};try {logistics=JSON.parse(row.logistics_json||'{}')||{};}catch{ /* Legacy record. */ }
  result.trackingNumber=logistics.tracking_number||'';
  const g=row.gateway_refund;
  result.gateway_refund=g ? Object.fromEntries(['state','total','gateway_amount','credit_amount','provider','provider_refund_id','checked_at'].filter(key=>g[key]!==undefined).map(key=>[key,g[key]])) : null;
  if(row.order) result.order=Object.fromEntries(['id','order_number','status','payment_status','payment_method','total'].map(key=>[key,row.order[key]]));
  return result;
}

// Allocate the saved order total (including its discount) over purchased units.
// Integer paise and a deterministic remainder make the whole selection exact.
export function returnAllocation(lines,total) {
  const paise=Math.round(Number(total)*100);
  const weights=lines.map(line=>Math.round(Number(line.unit_price)*100)*Number(line.quantity));
  if(!Number.isSafeInteger(paise)||paise<0||weights.some((weight,index)=>!Number.isSafeInteger(weight)||weight<0||!Number.isSafeInteger(Number(lines[index].quantity))||Number(lines[index].quantity)<1)) throw new Error('Order amounts need review');
  const gross=weights.reduce((sum,weight)=>sum+BigInt(weight),0n);
  if(!gross && paise>0) throw new Error('Order amounts need review');
  if(!gross) return lines.map(line=>({...line,amount_paise:0}));
  let assigned=0;
  const result=lines.map((line,index)=>{
    const numerator=BigInt(paise)*BigInt(weights[index]);
    const allocated=Number(numerator/gross); assigned+=allocated;
    return {...line,amount_paise:allocated,remainder:numerator%gross};
  });
  const sorted=[...result].sort((a,b)=>a.remainder===b.remainder?String(a.id).localeCompare(String(b.id)):a.remainder>b.remainder?-1:1);
  for(let i=0;i<paise-assigned;i++) sorted[i%sorted.length].amount_paise++;
  for(const line of result) delete line.remainder;
  return result;
}

export function remainingReturnLines(lines,cases) {
  const used=new Map();
  for(const request of cases.filter(item=>!['rejected','cancelled'].includes(item.status))) {
    let selected;try{selected=JSON.parse(request.selected_items_json||'[]');}catch{selected=[];}
    if(!Array.isArray(selected)||!selected.length)return lines.map(line=>({...line,remaining_quantity:0})); // Legacy selection needs care review.
    for(const item of selected)used.set(item.line_id,(used.get(item.line_id)||0)+Number(item.quantity||0));
  }
  return lines.map(line=>({...line,returned_quantity:used.get(line.id)||0,remaining_quantity:Math.max(0,line.quantity-(used.get(line.id)||0))}));
}

export function selectReturnLines(lines,selection,total) {
  const allocations=returnAllocation(lines,total);
  if(!Array.isArray(selection)||!selection.length||selection.length>lines.length) throw new Error('Choose the purchased items to return');
  const seen=new Set();
  return selection.map(entry=>{
    const line=allocations.find(item=>item.id===entry.line_id);
    const quantity=Number(entry.quantity);
    if(!line||seen.has(entry.line_id)||!Number.isSafeInteger(quantity)||quantity<1||quantity>(line.remaining_quantity??line.quantity)) throw new Error('Choose a valid remaining purchased quantity');
    seen.add(entry.line_id);
    return {line_id:line.id,product_id:line.product_id,product_name:line.product_name,size:line.size,quantity,
      amount_paise:Math.floor(line.amount_paise/line.quantity)*quantity+Math.max(0,Math.min(quantity,line.amount_paise%line.quantity-(line.returned_quantity||0))),returnable:line.returnable_snapshot};
  });
}
