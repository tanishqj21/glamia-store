import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { workerFunctions } from './lib/worker-fixture.mjs';
const result=await build({entryPoints:['react-app/src/lib/wibrawlCommerceUI.js'],bundle:true,platform:'node',format:'esm',write:false});
const ui=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const worker=await workerFunctions(['invoiceLineItems']);
const product={id:'tee',name:'Tee',status:'live',price:799,stock:8,sizes:['M','L'],size_stock:{M:4,L:4},hsn_sac_code:'6109',gst_rate:5,gst_tax_inclusive:true};
test('size swaps merge quantities into the existing selection without copying presentation data',()=>{
 const cart=[{id:'tee',size:'M',quantity:1},{id:'tee',size:'L',quantity:2}];
 assert.deepEqual(ui.swapWibrawlSize(cart,{...cart[0],product},'L',product),[{id:'tee',size:'L',quantity:3}]);
 assert.equal(cart.length,2);
 assert.throws(()=>ui.swapWibrawlSize(cart,{...cart[0],quantity:3},'L',product),/cannot hold/);
 assert.throws(()=>ui.swapWibrawlSize(cart,cart[0],'XL',product),/cannot hold/);
});
for(const inclusive of [true,false]) for(const discount of [0,100,9999]) test(`GST estimate matches issued invoice rules / inclusive=${inclusive} / discount=${discount}`,()=>{
 const lines=[{product:{...product,gst_tax_inclusive:inclusive},item:{quantity:2}},{product:{...product,id:'tee2',price:499,gst_rate:12,gst_tax_inclusive:inclusive},item:{quantity:1}}];
 const subtotal=lines.reduce((sum,l)=>sum+l.product.price*l.item.quantity,0);
 const invoice=worker.invoiceLineItems({subtotal,discount,items:lines.map(l=>({...l.product,quantity:l.item.quantity}))});
 const actual=ui.wibrawlTaxEstimate(lines,discount);
 assert.equal(actual.complete,true);assert.equal(actual.total,Math.round(invoice.reduce((sum,l)=>sum+l.tax,0)*100)/100);
 assert.deepEqual(actual.entries.map(l=>l.tax),Array.from(invoice,l=>l.tax));
});
test('unknown classification remains unavailable; zero GST is valid',()=>{
 assert.equal(ui.wibrawlTaxEstimate([{product:{...product,hsn_sac_code:''},item:{quantity:1}}]).complete,false);
 assert.equal(ui.wibrawlTaxEstimate([{product:{...product,gst_rate:null},item:{quantity:1}}]).complete,false);
 const zero=ui.wibrawlTaxEstimate([{product:{...product,gst_rate:0},item:{quantity:1}}]);assert.equal(zero.complete,true);assert.equal(zero.total,0);
});
test('courier links require HTTPS and order filters preserve attention states',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,hi','http://example.com','/relative'])assert.equal(ui.safeTrackingUrl(url),'');
 assert.equal(ui.safeTrackingUrl('https://example.com/tracking'),'https://example.com/tracking');
 assert.equal(ui.orderBucket({status:'confirmed',payment_status:'failed'}),'attention');assert.equal(ui.orderBucket({status:'cancelled'}),'attention');assert.equal(ui.orderBucket({status:'shipped'}),'transit');assert.equal(ui.orderBucket({status:'delivered'}),'delivered');
});
test('ledger filters classify real credits and redemptions',()=>{
 assert.equal(ui.ledgerGroup({amount:-100,kind:'purchase'}),'spent');assert.equal(ui.ledgerGroup({amount:100,kind:'return_refund'}),'refunds');assert.equal(ui.ledgerGroup({amount:50,kind:'referral_reward'}),'referrals');assert.equal(ui.ledgerGroup({amount:100,kind:'admin_grant'}),'bonuses');
});
