import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { billLogoBytes } from './order-bills.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','content-type':'application/pdf','referrer-policy':'no-referrer'};

export async function saveReturnLogistics(request,env,current,actor,context={}) {
  if(Number(request.headers.get('content-length'))>3000000) throw fail('Label must be 2 MB or smaller',413);
  // Bound the stream even when Content-Length is missing or dishonest.
  const reader=request.body?.getReader(); let size=0; const chunks=[];
  if(!reader) throw fail('Add return instructions');
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>3000000){await reader.cancel();throw fail('Label must be 2 MB or smaller',413);} chunks.push(value); }
  const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let body; try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('Invalid return instructions');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Invalid return instructions');
  let old={}; try {old=JSON.parse(current.logistics_json||'{}')||{};} catch { /* Legacy record. */ }
  const logistics={};
  const canPrepare=['requested','approved'].includes(current.status);
  if(body.courier_name!==undefined) body.carrier=body.courier_name;
  for(const key of ['carrier','tracking_number','pickup_at','pickup_window','next_update_at','tracking_url','instructions','inspection_note']) logistics[key]=String(body[key]??old[key]??'').trim().slice(0,key==='instructions'||key==='inspection_note'?1000:key==='tracking_url'?500:120);
  logistics.pickup_status=String(body.pickup_status??old.pickup_status??'not_booked');
  if(!['not_booked','scheduled','collected','in_transit','delivered','cancelled'].includes(logistics.pickup_status)) throw fail('Choose a valid pickup status');
  if(logistics.pickup_at && !Number.isFinite(Date.parse(logistics.pickup_at))) throw fail('Choose a valid pickup date');
  if(logistics.next_update_at&&!Number.isFinite(Date.parse(logistics.next_update_at)))throw fail('Choose a valid next-update date');
  if(logistics.tracking_url){
    let link;try{link=new URL(logistics.tracking_url);}catch{throw fail('Choose a valid courier tracking URL');}
    const hosts=['delhivery.com','bluedart.com','dtdc.in','dtdc.com','indiapost.gov.in','ekartlogistics.in','ecomexpress.in','xpressbees.com'];
    if(link.protocol!=='https:'||link.username||link.password||link.port||!hosts.some(host=>link.hostname===host||link.hostname.endsWith('.'+host)))throw fail('Use the official HTTPS tracking link from a supported courier');
    logistics.tracking_url=link.href;
  }
  if(current.pickup_confirmed_at && (logistics.carrier!==old.carrier || logistics.tracking_number!==old.tracking_number || ['not_booked','scheduled','cancelled'].includes(logistics.pickup_status))) throw fail('Confirmed courier custody cannot be changed or reset',409);
  logistics.label_details=old.label_details;
  logistics.label_status_message=old.label_status_message;
  let key=current.label_key||null;
  if(body.generate_label && body.label_base64) throw fail('Generate a label or upload a courier PDF, not both');
  const trackingChanged=logistics.carrier!==old.carrier || logistics.tracking_number!==old.tracking_number;
  // No PDF may silently describe an earlier booking, including cleared tracking.
  if(key && trackingChanged && !body.label_base64) {
    key=null;
    logistics.label_status_message='Tracking changed. Upload the new courier PDF or generate a manual label.';
  }
  if(canPrepare && !body.label_base64) {
    const shipping=context.shipping||{};
    const customerAddress=[shipping.line1,shipping.line2,shipping.city,shipping.state,shipping.pin,shipping.country||'India'].filter(Boolean).join(', ');
    const warehouse=typeof context.warehouse_address==='string'?context.warehouse_address.trim():'';
    if(shipping.line1 && warehouse && (!key || (old.label_details && trackingChanged))) {
      logistics.label_details={customer_name:context.customer_name||shipping.name||'Customer',customer_address:customerAddress,warehouse_address:warehouse,courier_name:logistics.carrier,tracking_number:logistics.tracking_number,request_id:current.id,order_number:current.order?.order_number||current.order_id};
      if(!key)logistics.label_status_message='Label prepared — awaiting courier and tracking number.';
    } else if(!key) logistics.label_status_message='Care must verify the customer and warehouse addresses before preparing the label.';
  }
  const automaticLabel=canPrepare && logistics.carrier && logistics.tracking_number && !body.label_base64 && (!key || (old.label_details && trackingChanged));
  if(body.generate_label || automaticLabel) {
    try {
    if(!canPrepare || !logistics.carrier || !logistics.tracking_number) throw fail('Use an active return request and assign courier tracking before generating its label',409);
    if(!env.RETURN_DOCUMENTS) throw fail('Configure the private RETURN_DOCUMENTS bucket before generating labels',503);
    const shipping=context.shipping||{};
    const customerAddress=[shipping.line1,shipping.line2,shipping.city,shipping.state,shipping.pin,shipping.country||'India'].filter(Boolean).join(', ');
    const warehouse=typeof context.warehouse_address==='string'?context.warehouse_address.trim():'';
    if(!shipping.line1 || !warehouse) throw fail('Configure the warehouse return address and verify the customer address first',409);
    logistics.label_details={customer_name:context.customer_name||shipping.name||'Customer',customer_address:customerAddress,warehouse_address:warehouse,courier_name:logistics.carrier,tracking_number:logistics.tracking_number,request_id:current.id,order_number:current.order?.order_number||current.order_id};
    const pdf=await generatedReturnLabel(logistics.label_details);
    const generatedKey=`private-returns/${current.id}/${crypto.randomUUID()}.pdf`;
    await env.RETURN_DOCUMENTS.put(generatedKey,pdf,{httpMetadata:{contentType:'application/pdf'}});
    key=generatedKey;
    delete logistics.label_status_message;
    } catch(error) {
      if(body.generate_label) throw error;
      // Approval and saved booking survive a missing address/storage configuration.
      // Never leave an old generated PDF available with new tracking metadata.
      key=null;
      logistics.label_status_message=error.status===409?error.message:'Label generation needs attention. Care must generate or upload the return PDF.';
    }
  }
  if(body.label_base64) {
    if(!env.RETURN_DOCUMENTS) throw fail('Configure the private RETURN_DOCUMENTS bucket before uploading labels',503);
    let data; try{data=Uint8Array.from(atob(body.label_base64),c=>c.charCodeAt(0));}catch{throw fail('Choose a PDF label');}
    if(data.length>2097152||new TextDecoder().decode(data.slice(0,5))!=='%PDF-') throw fail('Choose a PDF label up to 2 MB');
    // Not in the public products/reviews namespace or orphan-cleanup prefixes.
    key=`private-returns/${current.id}/${crypto.randomUUID()}.pdf`;
    await env.RETURN_DOCUMENTS.put(key,data,{httpMetadata:{contentType:'application/pdf'}});
    delete logistics.label_details;
    delete logistics.label_status_message;
  }
  const serialized=JSON.stringify(logistics);
  try {
    const results=await env.DB.batch([
      env.DB.prepare('UPDATE return_requests SET logistics_json=?,label_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=? AND logistics_json IS ? AND pickup_confirmed_at IS ?').bind(serialized,key,current.id,current.status,current.logistics_json,current.pickup_confirmed_at||null),
      env.DB.prepare("INSERT INTO admin_audit_log(id,admin_email,action,entity_type,entity_id,details_json) SELECT ?,?,'return_logistics','return_request',id,? FROM return_requests WHERE id=? AND changes()>0")
        .bind(crypto.randomUUID(),actor,JSON.stringify({pickup_status:logistics.pickup_status,label_added:Boolean(key && key!==current.label_key),generated:Boolean(!body.label_base64 && key && key!==current.label_key),label_prepared:Boolean(logistics.label_details)}),current.id)
    ]);
    if(!results[0]?.meta?.changes) throw fail('This return changed. Refresh before saving its logistics.',409);
  } catch(error) {
    if(key && key!==current.label_key && env.RETURN_DOCUMENTS.delete) await env.RETURN_DOCUMENTS.delete(key).catch(()=>null);
    throw error;
  }
}

export async function generatedReturnLabel(details) {
  const pdf=await PDFDocument.create(); const page=pdf.addPage([595,842]);
  const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle('Glamia return shipping label');pdf.setAuthor('Glamia');
  page.drawRectangle({x:0,y:735,width:595,height:107,color:rgb(.1,.1,.1)});
  page.drawText('GLAMIA / RETURN LABEL',{x:42,y:785,size:21,font:bold,color:rgb(.82,.69,.96)});
  const safe=value=>{
    const text=String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ');
    try {font.encodeText(text);}catch{throw fail('This address uses a script not supported by the manual PDF template. Upload a courier-provided PDF instead.',409);}
    return text;
  };
  let y=695;
  for(const [title,value] of [['Order',details.order_number],['Return request',details.request_id],['From customer',`${details.customer_name}, ${details.customer_address}`],['Return to warehouse',details.warehouse_address],['Courier',details.courier_name],['Tracking number',details.tracking_number]]) {
    page.drawText(title,{x:42,y,size:11,font:bold});y-=19;
    let row='';for(const character of safe(value)){if(font.widthOfTextAtSize(row+character,11)>500){page.drawText(row,{x:42,y,size:11,font});row='';y-=16;}row+=character;}
    if(row)page.drawText(row,{x:42,y,size:11,font});y-=32;
  }
  if(y<160)throw fail('The manual label is too long to fit on one page. Upload the courier-provided PDF instead.',409);
  page.drawRectangle({x:42,y:y-65,width:500,height:60,borderColor:rgb(.6,.6,.6),borderWidth:1});
  page.drawText('BARCODE / QR PLACEHOLDER - NOT SCANNABLE',{x:65,y:y-40,size:12,font:bold});
  page.drawText('Manual return label. Courier booking must be arranged separately.',{x:42,y:65,size:10,font});
  return pdf.save();
}

export async function returnDocument(env,returned,type) {
  if(type==='label') {
    if(!returned.label_key || !env.RETURN_DOCUMENTS) throw fail('A return label has not been provided yet',404);
    const object=await env.RETURN_DOCUMENTS.get(returned.label_key);
    if(!object) throw fail('Return label unavailable. Contact care.',404);
    return new Response(object.body,{headers:{...headers,'content-disposition':'attachment; filename="Glamia-return-label.pdf"'}});
  }
  const g=returned.gateway_refund;
  if(g?.state!=='processed' && returned.credit_approval_status!=='credited') throw fail('A confirmed refund is required for a receipt',409);
  const pdf=await PDFDocument.create(); const page=pdf.addPage([595,842]);
  pdf.setTitle(`Glamia refund confirmation ${returned.order?.order_number||returned.order_id}`);
  pdf.setAuthor('Glamia');
  const font=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({x:0,y:735,width:595,height:107,color:rgb(.10,.10,.10)});
  const logo=env.ASSETS ? await pdf.embedPng(await billLogoBytes(env)) : null;
  if(logo) page.drawImage(logo,{x:42,y:778,width:38,height:38});
  page.drawText('GLAMIA',{x:logo?91:42,y:785,size:24,font:bold,color:rgb(.82,.69,.96)});
  page.drawText('Refund confirmation',{x:42,y:754,size:15,font,color:rgb(.96,.95,.93)});
  const safe=value=>String(value||'Not recorded').replace(/[^\x20-\x7e]/g,' ').slice(0,85);
  const lines=[['Order',returned.order?.order_number||returned.order_id],['Request',returned.id],
    ['Confirmed amount',`INR ${Number(g?.total??returned.refund_amount).toFixed(2)}`],
    ['Destination',g?`${g.provider}: INR ${Number(g.gateway_amount).toFixed(2)}`:'Glamia store credits'],
    ['Store credits restored',g?String(g.credit_amount||0):String(returned.refund_amount)],
    ['Provider reference',g?.provider_refund_id||'Store-credit ledger'],['Confirmed on (IST)',receiptDate(returned.refund_processed_at)]];
  let y=685; for(const [label,value] of lines){
    page.drawText(label,{x:42,y,size:10,font:bold});
    let row=''; let rowY=y;
    for(const character of safe(value)) {
      if(font.widthOfTextAtSize(row+character,10)>340) {page.drawText(row,{x:210,y:rowY,size:10,font});row='';rowY-=14;}
      row+=character;
    }
    if(row) page.drawText(row,{x:210,y:rowY,size:10,font});
    y=Math.min(y-38,rowY-24);
  }
  page.drawText('Provider confirmation is not confirmation of posting on your bank statement.',{x:42,y:330,size:9,font});
  page.drawText('This document records the refund, not a new tax invoice. Keep it for your records.',{x:42,y:311,size:9,font});
  return new Response(await pdf.save(),{headers:{...headers,'content-disposition':'attachment; filename="Glamia-refund-receipt.pdf"'}});
}

function receiptDate(value) {
  if(!value) return 'Not recorded';
  const raw=String(value),parsed=new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)?raw.replace(' ','T')+'Z':raw);
  return Number.isFinite(parsed.getTime())?parsed.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true})+' IST':'Not recorded';
}
