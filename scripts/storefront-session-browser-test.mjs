// Browser cookies and credentialed CORS against the real Worker/session helper;
// HTTPS hosts are intercepted, so no production account or endpoint is touched.
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { STOREFRONT_ORIGINS, WIBRAWL_ORIGIN } from '../src/storefront-identity.js';

const subtle = new Proxy(crypto.subtle, {get(target,key) {if(key==='timingSafeEqual')return timingSafeEqual; const value=target[key];return typeof value==='function'?value.bind(target):value;}});
const worker = await workerFunctions(['routeApi','signSession','withSecurityHeaders'],{crypto:{subtle,randomUUID:()=>crypto.randomUUID()}});
const {db,env}=localDatabase();
env.SESSION_SECRET='browser-fixture-secret';
const user={sub:'browser-session',email:'browser-session@example.com',name:'Browser Session',role:'seller'};
db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(user.email,user.sub,user.name);
const bundle=await build({stdin:{contents:`import {readStorefrontSession} from './react-app/src/lib/storefrontSession.js'; window.readSession=readStorefrontSession; readStorefrontSession().then(session=>window.session=session);`,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch();
const errors=[];
try {
  for(const [legacyOrigin,destination] of [[STOREFRONT_ORIGINS[0],WIBRAWL_ORIGIN],[STOREFRONT_ORIGINS[1],WIBRAWL_ORIGIN],[WIBRAWL_ORIGIN,STOREFRONT_ORIGINS[0]]]) {
    const token=await worker.signSession(user,env);
    const context=await browser.newContext();
    await context.addCookies([{name:'__Host-mm_session',value:token,url:legacyOrigin+'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      assert.ok(STOREFRONT_ORIGINS.includes(url.origin),'Fixture must never make external requests');
      if(url.pathname==='/client.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
      if(url.pathname.startsWith('/api/')) {
        const headers=await route.request().allHeaders();
        const request=new Request(url,{method:route.request().method(),headers});
        const response=worker.withSecurityHeaders(await worker.routeApi(request,env,url,{}));
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      }
      // Same CSP as production (including allowed sibling connections).
      const response=worker.withSecurityHeaders(new Response('<!doctype html><html><head><title>Session fixture</title></head><body><script src="/client.js"></script></body></html>',{headers:{'Content-Type':'text/html'}}));
      return route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(destination);
    await page.waitForFunction(()=>window.session?.user);
    assert.equal((await page.evaluate(()=>window.session.user)).email,user.email);
    const shared=(await context.cookies()).find(cookie=>cookie.name==='__Secure-mm_shared_session');
    assert.ok(shared?.httpOnly&&shared.secure&&shared.domain==='.glamiastore.com');
    assert.equal(await page.evaluate(()=>document.cookie.includes('mm_shared_session')),false,'Session token stays inaccessible to JavaScript');
    await page.goto(legacyOrigin);
    await page.waitForFunction(()=>window.session?.user);
    // Logout from the destination, then retry the old host-only cookie.
    await page.goto(destination);await page.waitForFunction(()=>window.session?.user);
    await page.evaluate(async()=>{await fetch('/api/logout',{method:'POST',headers:{'X-Requested-With':'Glamia'}});window.session=await window.readSession();});
    assert.equal(await page.evaluate(()=>window.session.user),null);
    await page.goto(legacyOrigin);await page.waitForFunction(()=>window.session!==undefined);
    assert.equal(await page.evaluate(()=>window.session.user),null,'Old host cookie cannot resurrect a revoked session');
    await context.close();
    console.log(`Existing ${new URL(legacyOrigin).hostname} login transfers to ${new URL(destination).hostname}; shared logout passes.`);
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();db.close();}
