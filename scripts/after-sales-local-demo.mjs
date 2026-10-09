// Local-only, throwaway demo. Real Worker functions + migrated in-memory D1.
// No .dev.vars, production data, provider credentials or external network.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminReturnsFixture, owner, customer } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';
import { saveReturnLogistics, returnDocument } from '../src/return-logistics.js';

export async function createDemoServer(port = 5195) {
  const f = await adminReturnsFixture();
  const base = `http://127.0.0.1:${port}`;
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const shipping = { name: 'Meera Shah', line1: '12 Sample Street', city: 'New Delhi', state: 'Delhi', pin: '110002', country: 'India' };
  const warehouse = 'Glamia demo returns warehouse, New Delhi 110001';
  const actors = { customer: { ...customer, id: 'demo-customer', name: 'Meera Shah' }, admin: { ...owner, id: 'demo-owner' } };
  const documents = new Map();
  const state = { providerStatus: 'pending', providerPosts: 0, requests: [], errors: [] };
  Object.assign(f.env, { GATEWAY_REFUNDS_ENABLED: 'true', RAZORPAY_KEY_ID: 'local_demo', RAZORPAY_KEY_SECRET: 'not_a_real_key', PUBLIC_SITE_URL: base });
  f.env.RETURN_DOCUMENTS = { put: async (key, body) => documents.set(key, body), get: async key => documents.has(key) ? { body: documents.get(key) } : null, delete: async key => documents.delete(key) };
  f.db.prepare('UPDATE orders SET order_number=?,shipping_json=? WHERE id=?').run('GM-DEMO-EXCHANGE-001', JSON.stringify(shipping), 'manual-order');
  const original = f.db.prepare('SELECT * FROM orders WHERE id=?').get('manual-order');
  const second = { ...original, id: 'return-order', order_number: 'GM-DEMO-RETURN-002', gateway_order_id: 'order_return', gateway_payment_id: 'pay_return', created_at: new Date(Date.now() - 86400000).toISOString() };
  const columns = Object.keys(second);
  f.db.prepare(`INSERT INTO orders(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`).run(...columns.map(key => second[key]));
  f.db.prepare(`INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('return-line','return-order',?,'Ivory linen shirt',949.5,1,'M')`).run(f.productId);
  f.db.prepare("UPDATE storefront_settings SET value_json=? WHERE setting_key='fulfillment'").run(JSON.stringify({ warehouse_address: warehouse }));
  const api = await workerFunctions(['createReturnRequest','customerOrderReturnOptions','listOrders','listReturns','getReturnRequest','updateReturnRequest','confirmReturnPickup','confirmWarehouseReceipt','handleGatewayRefund','updateOrderStatus','markEmployeeOrderPacked','listAdminNotifications','getAdminNotificationCount','updateAdminNotification'], {
    fetch: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      assert.equal(url.origin, 'https://api.razorpay.com', 'No external gateway may be contacted');
      // Responses are manufactured locally; fetch is never called.
      if (url.pathname === '/v1/payments/pay_return') return Response.json({ id: 'pay_return', order_id: 'order_return', currency: 'INR', amount: 94950, amount_refunded: 0, status: 'captured' });
      if (url.pathname === '/v1/payments/pay_return/refund') {
        assert.equal(init.method, 'POST'); state.providerPosts++;
        return Response.json({ id: 'rfnd_localdemo', status: 'pending' });
      }
      if (url.pathname === '/v1/refunds/rfnd_localdemo') return Response.json({ id: 'rfnd_localdemo', entity: 'refund', payment_id: 'pay_return', currency: 'INR', amount: 94950, status: state.providerStatus });
      throw Error(`Unexpected simulated gateway path ${url.pathname}`);
    },
  });
  const toolbar = `<style>#demo-caption{position:fixed;z-index:99999;bottom:0;left:0;right:0;background:#15121eeF;color:#fff;border-top:2px solid #c4a5ef;padding:12px 24px;font:14px/1.5 Arial;display:flex;justify-content:space-between;gap:24px;box-shadow:0 -4px 20px #0002}#demo-caption strong{font-size:18px;display:block}#demo-caption small{color:#d2c7df}#demo-caption a{color:#e2c8ff;margin-left:14px}body{padding-bottom:86px}</style><aside id="demo-caption"><div><strong id="demo-title">Glamia · Local return & exchange demo</strong><span id="demo-detail">Isolated demo orders. Gateway responses simulated. No real money or courier booking.</span></div><div><small>LOCAL ONLY</small><br><a href="/__demo/role?role=customer&to=/orders">Customer</a><a href="/__demo/role?role=admin&to=/admin/returns">Admin</a><a href="/__demo">Guide</a></div></aside>`;
  const empty = { stats: {}, balance: 0, transactions: [], notifications: [], unread_count: 0, unread: 0, requests: [], orders: [], products: [], categories: [], events: [], slides: [], tickets: [], addresses: [], settings: {} };
  const server = createServer(async (incoming, outgoing) => {
    outgoing.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:");
    try {
      const url = new URL(incoming.url, base);
      if (url.origin !== base) throw Object.assign(Error('Local demo only'), { status: 403 });
      const role = /(?:^|;\s*)demo_role=admin(?:;|$)/.test(incoming.headers.cookie || '') ? 'admin' : 'customer';
      const actor = actors[role];
      if (url.pathname === '/__demo/videos') {
        outgoing.setHeader('Content-Type','text/html; charset=utf-8');
        return outgoing.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glamia · Local walkthrough videos</title></head><body style="margin:0;background:#f6f3fa;color:#211b2c;font:16px/1.6 Arial;padding:30px"><main style="max-width:1440px;margin:auto"><p>GLAMIA / LOCAL WALKTHROUGHS</p><h1>Return & exchange · Both sides</h1><p>Actual website screens and backend logic. Demo customers, an in-memory database and simulated payment-provider responses. No live money or courier bookings.</p><video style="width:100%;max-height:85vh;background:#17141d" controls preload="metadata" src="/__demo/video/full"></video><p><a href="/__demo/video/full" download="Glamia-return-and-exchange-demo.mp4">Download full walkthrough</a> · <a href="/__demo/video/exchange" download="Glamia-exchange-demo.mp4">Exchange only</a> · <a href="/__demo/video/return" download="Glamia-return-demo.mp4">Return only</a></p><p><a href="/__demo">Try the interactive local demo</a></p></main></body></html>`);
      }
      const videoRoute=url.pathname.match(/^\/__demo\/video\/(full|exchange|return)$/);
      if(videoRoute) {
        const filename=videoRoute[1]==='full'?'return-exchange-full-demo.mp4':`${videoRoute[1]}-demo.mp4`;
        const video=await readFile(fileURLToPath(new URL(`../test-results/after-sales-video/${filename}`,import.meta.url)));
        outgoing.setHeader('Content-Type','video/mp4');outgoing.setHeader('Accept-Ranges','bytes');
        const range=incoming.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if(range) {
          const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):video.length-1,video.length-1);
          if(start>=video.length||end<start){outgoing.writeHead(416,{'Content-Range':`bytes */${video.length}`});return outgoing.end();}
          outgoing.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${video.length}`,'Content-Length':end-start+1});return outgoing.end(video.subarray(start,end+1));
        }
        outgoing.setHeader('Content-Length',video.length);return outgoing.end(video);
      }
      if (url.pathname === '/__demo/role') {
        const next = url.searchParams.get('role') === 'admin' ? 'admin' : 'customer';
        const to = url.searchParams.get('to') || (next === 'admin' ? '/admin/returns' : '/orders');
        if (!['/orders','/admin/returns','/admin/orders','/admin/completed-orders','/admin/notifications'].includes(to)) throw Error('Unsupported demo destination');
        outgoing.writeHead(302, { 'Set-Cookie': `demo_role=${next}; Path=/; SameSite=Strict; HttpOnly`, Location: to }); return outgoing.end();
      }
      if (url.pathname === '/__demo') {
        outgoing.setHeader('Content-Type', 'text/html; charset=utf-8');
        return outgoing.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glamia local demo guide</title></head><body style="font:18px/1.7 Arial;padding:40px;max-width:900px"><h1>Glamia · Return & exchange demo</h1><p>This uses the actual website and backend functions with a disposable in-memory database. No login password is needed here; never deploy this demo server.</p><p><a href="/__demo/videos">Watch both captioned walkthroughs</a></p><h2>Exchange</h2><p>Use <b>GM-DEMO-EXCHANGE-001</b>. Request size L, see the immediate ₹0 replacement, then switch to admin to arrange pickup and publish tracking.</p><h2>Return</h2><p>Use <b>GM-DEMO-RETURN-002</b>. Choose original payment refund. Admin approves the return, saves tracking, confirms pickup and processes the simulated refund.</p><p><a href="/__demo/role?role=customer&to=/orders">Open customer orders</a> · <a href="/__demo/role?role=admin&to=/admin/returns">Open admin Returns</a> · <a href="/__demo/role?role=admin&to=/admin/orders">Open admin Orders</a></p><p><b>Demo controls:</b> after processing the local refund, <a href="/__demo/provider-confirm">simulate provider confirmation</a>, then use Admin’s Check provider status button. All state resets when the server restarts.</p><p>Courier labels are generated PDFs with an explicitly non-scannable placeholder. Courier booking and pickup are manual.</p></body></html>`);
      }
      if (url.pathname === '/__demo/provider-confirm') {
        if (role !== 'admin') throw Object.assign(Error('Switch to demo admin'), { status: 403 });
        state.providerStatus = 'processed'; outgoing.writeHead(302, { Location: '/admin/returns' }); return outgoing.end();
      }
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
        const method = incoming.method;
        const request = new Request(url, { method, headers: { 'content-type': 'application/json' }, ...(!['GET','HEAD'].includes(method) ? { body: Buffer.concat(chunks).toString() || '{}' } : {}) });
        let response;
        if (url.pathname === '/api/session') response = Response.json({ user: actor, needs_profile_completion: false });
        else if (url.pathname === '/api/orders') response = await api.listOrders(f.env, actor, role === 'admin' ? 'admin' : 'own', url.searchParams);
        else if (url.pathname === '/api/returns') response = await api.listReturns(f.env, actor, role === 'admin' ? 'admin' : 'own');
        else if (url.pathname === '/api/admin/notifications') { assert.equal(role,'admin'); response = await api.listAdminNotifications(f.env); }
        else if (url.pathname === '/api/admin/notifications/count') { assert.equal(role,'admin'); response = await api.getAdminNotificationCount(f.env); }
        else if (url.pathname === '/api/storefront-settings') response = Response.json({ announcement: { visible: true, text: 'LOCAL DEMO — No real payments', items: [] }, fulfillment: { warehouse_address: warehouse }, seo: { title: 'Glamia local demo' }, socials: {} });
        else {
          const customerReturn = url.pathname.match(/^\/api\/orders\/([^/]+)\/returns$/);
          const returned = url.pathname.match(/^\/api\/admin\/returns\/([^/]+)(?:\/(logistics|pickup|receipt|refund)(?:\/(\w+))?)?$/);
          const order = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
          const document = url.pathname.match(/^\/api\/returns\/([^/]+)\/(label|receipt)$/);
          if (customerReturn) response = method === 'GET' ? await api.customerOrderReturnOptions(f.env, actor, customerReturn[1]) : await api.createReturnRequest(request, f.env, actor, customerReturn[1]);
          else if (returned) {
            assert.equal(role,'admin'); const id = returned[1], action = returned[2];
            if (action === 'logistics') {
              await saveReturnLogistics(request, f.env, await api.getReturnRequest(f.env,id), actor.email, { warehouse_address: warehouse, shipping, customer_name: 'Meera Shah' });
              response = Response.json({ request: await api.getReturnRequest(f.env,id) });
            } else if (action === 'pickup') response = await api.confirmReturnPickup(request,f.env,actor,id);
            else if (action === 'receipt') response = await api.confirmWarehouseReceipt(request,f.env,actor,id);
            else if (action === 'refund') response = await api.handleGatewayRefund(request,f.env,actor,id,returned[3]);
            else response = await api.updateReturnRequest(request,f.env,actor,id);
          } else if (order) { assert.equal(role,'admin'); response = await api.updateOrderStatus(request,f.env,order[1],actor); }
          else if (document) {
            const r = await api.getReturnRequest(f.env,document[1]);
            if (!r || (role !== 'admin' && r.customer_email !== actor.email)) throw Object.assign(Error('Not found'),{status:404});
            response = await returnDocument(f.env,r,document[2]);
          } else if (!['GET','HEAD'].includes(method) && !['/api/analytics/track','/api/coupons/available'].includes(url.pathname)) throw Object.assign(Error('Unsupported local demo action'),{status:404});
          else response = Response.json(empty);
        }
        state.requests.push({ method, path:url.pathname, status:response.status });
        if (response.status >= 400) state.errors.push({ method,path:url.pathname,status:response.status,body:await response.clone().text() });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers)); return outgoing.end(Buffer.from(await response.arrayBuffer()));
      }
      const candidate = resolve(publicDir,'.'+decodeURIComponent(url.pathname));
      const rel = relative(publicDir,candidate);
      if (rel.startsWith('..') || resolve(candidate) === publicDir && url.pathname !== '/') throw Object.assign(Error('Not found'),{status:404});
      const types = { '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.json':'application/json', '.ico':'image/x-icon' };
      if (extname(candidate) && extname(candidate) !== '.html') {
        outgoing.setHeader('Content-Type',types[extname(candidate)] || 'application/octet-stream'); return outgoing.end(await readFile(candidate));
      }
      let html = await readFile(resolve(publicDir,'index.html'),'utf8');
      // Demo-only decoration, never written into production assets.
      html = html.replace('</body>',toolbar+'</body>');
      outgoing.setHeader('Content-Type','text/html; charset=utf-8'); outgoing.end(html);
    } catch (error) {
      outgoing.writeHead(error.status || 500,{'Content-Type':'application/json'}); outgoing.end(JSON.stringify({error:error.message}));
    }
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
  return { ...f, api, base, state, actors, documents, server, close: async () => { await new Promise(resolve=>server.close(resolve));f.db.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const demo = await createDemoServer();
  console.log(`Local demo: ${demo.base}/__demo (disposable data, simulated gateway only)`);
}
