import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['react-app/src/lib/wibrawlPersona.js'],bundle:true,platform:'node',format:'esm',write:false});
const {wibrawlPersona}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('persona vocabulary matches the approved routes and explanations',()=>{
 const dark=wibrawlPersona('gaming'),light=wibrawlPersona('sports');assert.deepEqual(dark.collections.map(h=>h.title),['JUST SPAWNED','CURRENT META','LOOT']);assert.deepEqual(dark.collections,light.collections);assert.deepEqual(dark.collections.map(h=>h.href),['/just-arrived','/best-sellers','/offers']);for(const hub of dark.collections)assert.ok(hub.tooltip&&hub.detail&&hub.short);
});
test('themes retain identical deck and badge copy while preserving the saved colour choice',()=>{assert.equal(wibrawlPersona().mode,'gaming');assert.equal(wibrawlPersona('unknown').mode,'gaming');assert.equal(wibrawlPersona('sports').mode,'sports');for(const key of ['deck','badge','dealBadge','sections'])assert.deepEqual(wibrawlPersona('gaming')[key],wibrawlPersona('sports')[key]);});
