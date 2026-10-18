import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['react-app/src/lib/wibrawlPersona.js'],bundle:true,platform:'node',format:'esm',write:false});
const {wibrawlPersona}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('persona vocabulary matches the approved routes and explanations',()=>{
 const dark=wibrawlPersona('gaming'),light=wibrawlPersona('sports');assert.deepEqual(dark.collections.map(h=>h.title),['JUST SPAWNED','CURRENT META','LOOT']);assert.deepEqual(light.collections.map(h=>h.title),['NEW SIGNING','TABLE LEADERS','LOCKER ROOM DEALS']);assert.deepEqual(dark.collections.map(h=>h.href),['/just-arrived','/best-sellers','/offers']);assert.deepEqual(dark.collections.map(h=>h.tooltip),light.collections.map(h=>h.tooltip));for(const hub of dark.collections)assert.ok(hub.tooltip&&hub.detail&&hub.short);
});
test('unknown or missing personas default to gaming, with distinct spec-deck and badge copy',()=>{assert.equal(wibrawlPersona().mode,'gaming');assert.equal(wibrawlPersona('unknown').mode,'gaming');assert.equal(wibrawlPersona('sports').deck,'Locker');assert.equal(wibrawlPersona().deck,'Loadout');assert.equal(wibrawlPersona().badge,'META');assert.equal(wibrawlPersona('sports').badge,'LEADER');});
