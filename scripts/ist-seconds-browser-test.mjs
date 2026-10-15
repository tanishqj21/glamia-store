// Built website, in-memory Worker/database, no production mutations.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
const {db,env}=localDatabase();
const worker=await workerFunctions(['listEvents','updateEvent']);
const owner={role:'admin',is_owner:true,email:'owner@example.com',name:'Local owner'};
const root=resolve('public');
const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.avif':'image/avif','.html':'text/html'};
const browser=await chromium.launch();const errors=[],results=[];
mkdirSync('test-results/ist-seconds',{recursive:true});
try {
 for(const brand of ['glamia','wibrawl'])for(const timezoneId of ['Asia/Kolkata','America/Los_Angeles','Asia/Tokyo']){
  db.exec('DELETE FROM events');
  db.prepare(`INSERT INTO events(id,slug,name,headline,message,type,status,theme,starts_at,ends_at,show_on_home,show_after_sign_in) VALUES('ist-fixture','ist-fixture','IST fixture','Local clock fixture','Clock test','sale','draft','graphite',?,?,1,0)`).run('2027-01-01T13:30:45.123Z','2027-01-02T13:30:45.123Z');
  const origin=`https://${brand==='wibrawl'?'wibrawl.':''}glamiastore.com`;
  const theme=timezoneId==='Asia/Tokyo'?'dark':'light';
  const context=await browser.newContext({timezoneId,colorScheme:theme,viewport:{width:brand==='wibrawl'?390:1440,height:950}});
  await context.addInitScript(theme=>{localStorage.setItem('glamia-theme',theme);localStorage.setItem('wibrawl-theme',theme==='dark'?'gaming':'sports');},theme);
  let submitted; let clockCampaign=null;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/api/admin/events'){
    const response=await worker.listEvents(env);return route.fulfill({status:response.status,json:await response.json()});
   }
   if(url.pathname==='/api/admin/events/ist-fixture'&&route.request().method()==='PATCH'){
    submitted=route.request().postDataJSON();
    const response=await worker.updateEvent(new Request(url,{method:'PATCH',body:JSON.stringify(submitted)}),env,'ist-fixture',owner);
    return route.fulfill({status:response.status,json:await response.json()});
   }
   if(url.pathname.startsWith('/api/')){
    const data=url.pathname==='/api/session'?{user:owner,needs_profile_completion:false}:url.pathname==='/api/storefront-settings'&&clockCampaign?{active_event:clockCampaign,sales_campaign:clockCampaign,trust_strip:{visible:false}}:{stats:{},products:[],slides:[],categories:[],notifications:[],orders:[],events:[],unread_count:0};
    return route.fulfill({json:data});
   }
   let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(relative(root,file).startsWith('..'))return route.abort();
   if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');
   return route.fulfill({body:readFileSync(file),contentType:mime[extname(file)]||'application/octet-stream'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/admin/events');
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  const starts=page.locator('input[name="starts_at"]');
  await expect(starts).toHaveValue('2027-01-01T19:00:45');
  assert.equal(await starts.getAttribute('step'),'1');
  await expect(page.locator('.schedule-seconds-label')).toHaveCount(0);
  await page.getByRole('button',{name:/Save changes/}).click();
  await expect.poll(()=>submitted?.starts_at).toBe('2027-01-01T19:00:45.123+05:30');
  // Copy edits retain the original fractional-second instant from the API.
  assert.equal(db.prepare("SELECT starts_at FROM events WHERE id='ist-fixture'").get().starts_at,'2027-01-01T13:30:45.123Z');
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await starts.fill('2027-01-01T20:15:37');
  await page.locator('input[name="ends_at"]').fill('2027-01-02T19:00:59');
  await expect(starts).toHaveValue('2027-01-01T20:15:37');
  submitted=null;await page.getByRole('button',{name:/Save changes/}).click();
  await expect.poll(()=>submitted?.starts_at).toBe('2027-01-01T14:45:37.000Z');
  assert.equal(db.prepare("SELECT starts_at FROM events WHERE id='ist-fixture'").get().starts_at,'2027-01-01T14:45:37.000Z');
  assert.equal(db.prepare("SELECT ends_at FROM events WHERE id='ist-fixture'").get().ends_at,'2027-01-02T13:30:59.000Z');
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await expect(starts).toHaveValue('2027-01-01T20:15:37');
  await expect(page.locator('input[name="ends_at"]')).toHaveValue('2027-01-02T19:00:59');
  await starts.fill('2027-01-01T20:15');
  await expect(starts).toHaveValue('2027-01-01T20:15');
  await starts.fill('2027-01-01T20:15:37');
  await page.locator('.schedule-datetime-field').first().scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`test-results/ist-seconds/${brand}-${timezoneId.replaceAll('/','-')}.png`});
  if(brand==='glamia'&&timezoneId==='Asia/Kolkata'){
    const clockNow=new Date('2027-01-01T13:30:00Z');
    await page.clock.install({time:clockNow});
    clockCampaign={id:'clock',active:true,show_on_home:true,headline:'Clock fixture',ends_at:new Date(clockNow.getTime()+65000).toISOString()};
    await page.goto(origin+'/');
    const countdown=page.locator('.event-countdown');
    await expect(countdown).toHaveText('Ends in 00h 01m 05s');
    await page.clock.runFor(1000);await expect(countdown).toHaveText('Ends in 00h 01m 04s');
    await page.clock.fastForward(65000);await expect(countdown).toHaveText('Event ended');
   }
   results.push({brand,theme,timezoneId,seconds:true,unchangedPrecision:true,changedInstant:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:results,pageErrors:errors},null,2));
}finally{await browser.close();db.close();}
