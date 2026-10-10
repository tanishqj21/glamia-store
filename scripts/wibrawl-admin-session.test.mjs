import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { WIBRAWL_ORIGIN, STOREFRONT_ORIGINS } from '../src/storefront-identity.js';

const subtle = new Proxy(crypto.subtle, { get(target, property) {
  if (property === 'timingSafeEqual') return timingSafeEqual;
  const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
} });
const worker = await workerFunctions(['routeApi', 'listHeroSlides', 'createHeroSlide', 'updateHeroSlide', 'deleteHeroSlide', 'reorderHeroSlides', 'heroInsights', 'signSession', 'currentUser', 'makeSessionCookie', 'withSecurityHeaders'], { crypto: { subtle, randomUUID: () => crypto.randomUUID() } });
const buyer = { sub: 'fixture', email: 'fixture@example.com', name: 'Fixture', role: 'seller' };
const root = STOREFRONT_ORIGINS[0];
function fixture(t) {
  const local = localDatabase(); t.after(() => local.db.close());
  local.env.SESSION_SECRET = 'isolated-test-secret';
  local.db.exec("UPDATE products SET status='hold'; DELETE FROM hero_slides;");
  local.db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(buyer.email, buyer.sub, buyer.name);
  for (const [id, storefront] of [['gm', 'glamia'], ['wb', 'wibrawl'], ['both', 'both']]) {
    local.db.prepare(`INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status,storefront_visibility)
      VALUES(?, 'seller@example.com', ?, 'Tees', 'Fixture', 100, 100, 10, 'Black', '[]', '/fixture.webp', 'Fixture', 'live', ?)`).run(id, id, storefront);
  }
  return local;
}
const heroRequest = (storefront, body, id = '', method = 'POST') => new Request(`${root}/api/admin/hero${id ? '/' + id : ''}?storefront=${storefront}`, { method, body: JSON.stringify(body) });
const slide = (product, extra = {}) => ({ title: 'Fixture collection', tagline: 'A collection for your world.', product_ids: [product], ...extra });

test('the additive migration preserves existing Glamia hero slides', t => {
  const {db} = localDatabase({through:'0111_wibrawl_storefront_scope.sql'}); t.after(() => db.close());
  db.exec("INSERT INTO hero_slides(id,title,tagline) VALUES('legacy','Original hero','Original tagline')");
  db.exec(readFileSync('migrations/0112_storefront_hero_carousels.sql','utf8'));
  assert.equal(db.prepare("SELECT storefront FROM hero_slides WHERE id='legacy'").get().storefront, 'glamia');
});

test('hero create, edit, ordering, publish and delete are isolated by storefront', async t => {
  const {db,env} = fixture(t);
  const gm = await (await worker.createHeroSlide(heroRequest('glamia',slide('gm')),env)).json();
  const wb = await (await worker.createHeroSlide(heroRequest('wibrawl',slide('wb')),env)).json();
  const draft = await (await worker.createHeroSlide(heroRequest('wibrawl',slide('both',{active:false})),env)).json();
  assert.equal(db.prepare('SELECT position FROM hero_slides WHERE id=?').get(wb.id).position,0);
  assert.equal(db.prepare('SELECT position FROM hero_slides WHERE id=?').get(draft.id).position,1);
  for (const [scope, id] of [['glamia',gm.id],['wibrawl',wb.id]]) {
    const data = await (await worker.listHeroSlides(env,false,scope)).json();
    assert.deepEqual(data.slides.map(s=>s.id),[id]);
  }
  assert.equal((await worker.updateHeroSlide(heroRequest('glamia',{title:'Wrong edit'},wb.id,'PATCH'),env,wb.id)).status,404);
  assert.equal((await worker.deleteHeroSlide(env,gm.id,'wibrawl')).status,404);
  await worker.updateHeroSlide(heroRequest('wibrawl',{active:true,position:0,title:'Published draft'},draft.id,'PATCH'),env,draft.id);
  assert.equal((await (await worker.listHeroSlides(env,true,'wibrawl')).json()).slides.length,2);
  await worker.deleteHeroSlide(env,wb.id,'wibrawl');
  assert.equal((await (await worker.listHeroSlides(env,false,'glamia')).json()).slides[0].id,gm.id);
});

test('hero validation and recommendations only use products assigned to that store', async t => {
  const {db,env} = fixture(t);
  await assert.rejects(worker.createHeroSlide(heroRequest('wibrawl',slide('gm')),env),{status:400});
  await assert.rejects(worker.createHeroSlide(heroRequest('unknown',slide('both')),env),{status:400});
  const wb = await (await worker.createHeroSlide(heroRequest('wibrawl',slide('wb')),env)).json();
  db.prepare("UPDATE products SET storefront_visibility='glamia' WHERE id='wb'").run();
  assert.equal((await (await worker.listHeroSlides(env,false,'wibrawl')).json()).slides.length,0,'Removed product cannot leak through a hero');
  assert.equal((await (await worker.listHeroSlides(env,true,'wibrawl')).json()).slides[0].id,wb.id,'Admin can still repair the slide');
  const insights = await (await worker.heroInsights(env,'wibrawl')).json();
  assert.deepEqual(insights.products.map(p=>p.id),['both']);
});

test('drag ordering includes hidden slides, rejects stale/cross-store lists and commits atomically', async t => {
  const {db,env} = fixture(t);
  const gm = await (await worker.createHeroSlide(heroRequest('glamia',slide('gm')),env)).json();
  const ids = [];
  for (const layout of ['poster','collage','split']) ids.push((await (await worker.createHeroSlide(heroRequest('wibrawl',slide('wb',{layout,active:layout!=='collage'})),env)).json()).id);
  const request = list => heroRequest('wibrawl',{ids:list},'order','PUT');
  await worker.reorderHeroSlides(request([...ids].reverse()),env);
  const all = (await (await worker.listHeroSlides(env,true,'wibrawl')).json()).slides;
  assert.deepEqual(all.map(s=>s.id),[...ids].reverse());
  assert.deepEqual(all.map(s=>s.position),[0,1,2]);
  assert.deepEqual(all.map(s=>s.layout),['split','collage','poster']);
  assert.deepEqual((await (await worker.listHeroSlides(env,false,'wibrawl')).json()).slides.map(s=>s.id),[ids[2],ids[0]]);
  for (const list of [ids.slice(1),[gm.id,...ids.slice(1)], [...ids,'stale']]) await assert.rejects(worker.reorderHeroSlides(request(list),env),{status:409});
  await assert.rejects(worker.reorderHeroSlides(request([ids[0],ids[0],ids[2]]),env),{status:400});
  // A failure partway through the D1 batch must not leave half-reordered rows.
  db.exec(`CREATE TRIGGER fail_hero_reorder BEFORE UPDATE OF position ON hero_slides WHEN NEW.id='${ids[1]}' BEGIN SELECT RAISE(ABORT,'fixture write failure'); END`);
  await assert.rejects(worker.reorderHeroSlides(request(ids),env));
  assert.deepEqual(db.prepare("SELECT id FROM hero_slides WHERE storefront='wibrawl' ORDER BY position").all().map(s=>s.id),[...ids].reverse());
  assert.equal(db.prepare('SELECT position FROM hero_slides WHERE id=?').get(gm.id).position,0);
});

test('layouts and campaign choice persist, and a broken product cannot prevent hiding a slide', async t => {
  const {db,env} = fixture(t);
  for (const field of [{layout:'unknown'},{imagery:'https://attacker.test/a.jpg'},{active:'false'}]) await assert.rejects(worker.createHeroSlide(heroRequest('wibrawl',slide('wb',field)),env),{status:400});
  const result = await (await worker.createHeroSlide(heroRequest('wibrawl',slide('wb',{layout:'split',imagery:'campaign'})),env)).json();
  const data = (await (await worker.listHeroSlides(env,false,'wibrawl')).json()).slides[0];
  assert.equal(data.layout,'split'); assert.equal(data.imagery,'campaign');
  db.exec("UPDATE products SET status='hold' WHERE id='wb'");
  await worker.updateHeroSlide(heroRequest('wibrawl',{active:false},result.id,'PATCH'),env,result.id);
  assert.equal(db.prepare('SELECT active FROM hero_slides WHERE id=?').get(result.id).active,0);
  await assert.rejects(worker.updateHeroSlide(heroRequest('wibrawl',{active:true},result.id,'PATCH'),env,result.id),{status:400});
});

test('public hero resolves from the hostname while admin requires authentication', async t => {
  const {env} = fixture(t);
  await worker.createHeroSlide(heroRequest('wibrawl',slide('wb')),env);
  const request = new Request(`${WIBRAWL_ORIGIN}/api/hero?storefront=glamia`);
  assert.equal((await (await worker.routeApi(request,env,new URL(request.url),{})).json()).slides[0].storefront,'wibrawl');
  const admin = new Request(`${root}/api/admin/hero?storefront=wibrawl`);
  await assert.rejects(worker.routeApi(admin,env,new URL(admin.url),{}),{status:401});
});

test('new browser logins use a secure HttpOnly shared cookie only on owned HTTPS hosts', () => {
  for (const origin of STOREFRONT_ORIGINS) {
    const cookie=worker.makeSessionCookie(new Request(origin),'token');
    assert.match(cookie,/^__Secure-mm_shared_session=token;/);
    for(const attribute of ['HttpOnly','SameSite=Lax','Path=/','Secure','Domain=glamiastore.com'])assert.ok(cookie.includes(attribute));
  }
  for(const origin of ['https://worker.workers.dev','https://glamiastore.com.attacker.test','http://glamiastore.com','http://localhost:8787'])assert.doesNotMatch(worker.makeSessionCookie(new Request(origin),'token'),/Domain=|shared_session/);
});

test('an existing host-only Glamia login is promoted and then authenticates Wibrawl', async t => {
  const {env} = fixture(t);
  const token = await worker.signSession(buyer,env);
  const request = new Request(`${root}/api/session/storefront-bridge`,{headers:{Origin:WIBRAWL_ORIGIN,Cookie:`__Host-mm_session=${token}`}});
  const response = worker.withSecurityHeaders(await worker.routeApi(request,env,new URL(request.url),{}));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),WIBRAWL_ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{shared:true});
  assert.match(response.headers.get('Set-Cookie'),/Domain=glamiastore.com/);
  const wb = new Request(WIBRAWL_ORIGIN,{headers:{Cookie:`__Secure-mm_shared_session=${token}; __Host-mm_session=stale-host-token`}});
  assert.equal((await worker.currentUser(wb,env)).email,buyer.email,'Shared login takes precedence over a stale host cookie');
  const elsewhere = new Request('https://worker.workers.dev',{headers:{Cookie:`__Secure-mm_shared_session=${token}`}});
  assert.equal(await worker.currentUser(elsewhere,env),null);
});

test('untrusted bridge origins and missing sessions cannot create a shared login', async t => {
  const {env} = fixture(t);
  for(const origin of ['https://attacker.test','https://wibrawl.glamiastore.com.attacker.test',null]) {
    const request = new Request(`${root}/api/session/storefront-bridge`,{headers:origin?{Origin:origin}:{}});
    const response = worker.withSecurityHeaders(await worker.routeApi(request,env,new URL(request.url),{}));
    assert.equal(response.status,403); assert.equal(response.headers.get('Set-Cookie'),null);
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
  }
  const request = new Request(`${root}/api/session/storefront-bridge`,{headers:{Origin:WIBRAWL_ORIGIN}});
  const response = await worker.routeApi(request,env,new URL(request.url),{});
  assert.deepEqual(await response.json(),{shared:false}); assert.equal(response.headers.get('Set-Cookie'),null);
});

test('logout clears the shared cookie and revokes both shared and legacy sessions', async t => {
  const {env} = fixture(t);
  const token = await worker.signSession(buyer,env);
  const request = new Request(`${WIBRAWL_ORIGIN}/api/logout`,{method:'POST',headers:{Origin:WIBRAWL_ORIGIN,Cookie:`__Secure-mm_shared_session=${token}`}});
  const response=await worker.routeApi(request,env,new URL(request.url),{});
  assert.ok(response.headers.getSetCookie().some(cookie=>cookie.startsWith('__Secure-mm_shared_session=;')&&cookie.includes('Max-Age=0')&&cookie.includes('Domain=glamiastore.com')));
  for(const [origin,name] of [[root,'__Host-mm_session'],[WIBRAWL_ORIGIN,'__Secure-mm_shared_session']])assert.equal(await worker.currentUser(new Request(origin,{headers:{Cookie:`${name}=${token}`}}),env),null);
});

test('publishing from the Glamia admin invalidates only the selected storefront cache', async () => {
  const deleted=[];
  const cacheWorker=await workerFunctions(['invalidateHeroCache'],{caches:{default:{delete:async request=>{deleted.push(new URL(request.url));return true;}}}});
  await cacheWorker.invalidateHeroCache(new Request(`${root}/api/admin/hero?storefront=wibrawl`),'wibrawl');
  assert.equal(deleted.length,3);
  assert.ok(deleted.every(url=>url.origin===WIBRAWL_ORIGIN));
  assert.ok(deleted.some(url=>url.pathname==='/api/hero'&&url.searchParams.get('cache')==='1'));
  deleted.length=0;
  await cacheWorker.invalidateHeroCache(new Request(`${root}/api/admin/hero?storefront=glamia`),'glamia');
  assert.equal(deleted.length,6);
  assert.ok(deleted.every(url=>STOREFRONT_ORIGINS.slice(0,2).includes(url.origin)));
});
