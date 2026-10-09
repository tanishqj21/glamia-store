// Local generated fixture only; does not call any gateway, database or live API.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {returnDocument} from '../src/return-logistics.js';
const folder=new URL('../test-results/refund-receipt/',import.meta.url);
mkdirSync(folder,{recursive:true});
const env={ASSETS:{fetch:async()=>new Response(readFileSync(new URL('../public/glamia-g-favicon.png',import.meta.url)))}};
const returned={id:'local-return-00000000-0000-0000-0000',order_id:'local-order',order:{order_number:'GM-LOCAL-PREVIEW'},refund_amount:199.99,refund_processed_at:'2026-10-03 10:30:00',gateway_refund:{state:'processed',total:199.99,gateway_amount:149.99,credit_amount:50,provider:'razorpay',provider_refund_id:'rfnd_local_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890'}};
const response=await returnDocument(env,returned,'receipt');
assert.equal(response.headers.get('cache-control'),'private, no-store');
const bytes=new Uint8Array(await response.arrayBuffer());
assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
writeFileSync(new URL('refund-receipt-preview.pdf',folder),bytes);
console.log('PASS verified refund receipt is a private, single-page branded PDF (local fixture).');
