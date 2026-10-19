// Public production verification only: GET/HEAD, no account/cart/order mutations.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {productUrl} from '../react-app/src/lib/commerce.js';
const origins=['https://glamiastore.com','https://wibrawl.glamiastore.com'];
const manifest=JSON.parse(readFileSync('public/.vite/manifest.json','utf8'));
const entry=Object.values(manifest).find(item=>item.isEntry).file;
const files=Object.values(manifest).filter(item=>/WibrawlOrderTimeline/.test(item.file)).flatMap(item=>[item.file,...item.css||[]]);
const checks=[];
async function get(url){const r=await fetch(url,{redirect:'manual',headers:{'Cache-Control':'no-cache'}});return r;}
for(const origin of origins){
 const response=await get(origin+'/orders?release=5fec83c');assert.equal(response.status,200);assert.ok((await response.text()).includes('/'+entry),'live HTML references the reviewed build');
 for(const file of [...new Set(files)]){const r=await get(origin+'/'+file);assert.equal(r.status,200);assert.ok((await r.text()).includes('wb-order-timeline'));}
 checks.push({origin,reviewedBuild:true,timelineAssets:true});
}
const selection=[];
for(const [index,origin]of origins.entries()){
 const r=await get(origin+'/api/products?view=cards&limit=10');assert.equal(r.status,200);const data=await r.json();
 const store=index?'wibrawl':'glamia';assert.ok(data.products.every(p=>[store,'both'].includes(p.storefront_visibility||'glamia')),'browsing stays scoped');
 const exclusive=data.products.find(p=>(p.storefront_visibility||'glamia')===store);assert.ok(exclusive,'exclusive live sample needed');selection.push(exclusive);
}
for(const [index,origin]of origins.entries()){
 const ids=selection.map(p=>p.id).join(',');
 const r=await get(origin+'/api/products?scope=cart&view=cards&include_stock=1&ids='+encodeURIComponent(ids));assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.products.map(p=>p.id).sort(),selection.map(p=>p.id).sort());assert.ok(data.products.every(p=>!Object.hasOwn(p,'seller_email')));
 const foreign=selection[index?0:1],owner=origins[index?0:1],path=productUrl(foreign);
 const redirect=await get(origin+path+'?size=M');assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),owner+path+'?size=M');
 const detail=await get(origin+'/api/products/'+encodeURIComponent(foreign.id)+'?scope=cart');assert.equal(detail.status,200);assert.equal((await detail.json()).product.id,foreign.id);
 checks.push({origin,sharedCartLookups:true,catalogueScoped:true,ownerDomainRedirect:true});
}
mkdirSync('tmp/shared-cart-review',{recursive:true});writeFileSync('tmp/shared-cart-review/live-report.json',JSON.stringify({checks,method:'GET only'},null,2));console.log(JSON.stringify({checks,method:'GET only'},null,2));
