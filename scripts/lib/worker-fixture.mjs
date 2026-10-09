// Real migrations and Worker functions, with an in-memory D1 adapter and no network.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

export function localDatabase({through='',foreignKeys=false}={}) {
  const db = new DatabaseSync(':memory:');
  if(foreignKeys)db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    if(through&&file>through)break;
    db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
  }
  let batchTail = Promise.resolve();
  const env = { DB: {
    batch(statements) {
      const result = batchTail.then(async () => {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      });
      batchTail = result.catch(() => {});
      return result;
    },
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() {
          if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return { results: db.prepare(sql).all(...args) };
          const result = db.prepare(sql).run(...args); return { meta: { changes: result.changes } };
        }
      };
    }
  } };
  return { db, env };
}

export async function workerFunctions(names, overrides = {}) {
  const context = createContext({ URL, URLSearchParams, Request, Response, Headers, AbortSignal, TextEncoder, TextDecoder, Uint8Array, Date, console, atob, btoa, crypto: globalThis.crypto, setTimeout, clearTimeout,
    fetch: () => { throw new Error('External requests forbidden in unit fixtures'); }, ...overrides });
  const modules = new Map();
  const entry = new URL('../../src/index.js', import.meta.url);
  async function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    // pdf-lib validates native Array/Object identities. Keep its renderer in
    // the same host realm as the npm package, rather than mixing VM objects.
    if (['../../src/order-bills.js','../../src/return-logistics.js'].some(path=>url.href===new URL(path,import.meta.url).href)) {
      const dependency = await import(url.href);
      const module = new SyntheticModule(Object.keys(dependency), function () {
        for (const [key, value] of Object.entries(dependency)) this.setExport(key, value);
      }, { context });
      modules.set(url.href, module);
      return module;
    }
    let source = readFileSync(url, 'utf8') + (url.href === entry.href ? `\nexport { ${names.join(', ')} };` : '');
    if (url.pathname.endsWith('.jsx')) {
      const { transformSync } = await import('esbuild');
      // Match Wrangler's default classic JSX transform, not Vite's automatic
      // browser transform; missing React bindings must fail local SSR checks.
      source = transformSync(source, { loader: 'jsx', jsx: 'transform', sourcefile: url.pathname }).code;
    }
    const module = new SourceTextModule(source, { context, identifier: url.href,
      importModuleDynamically: async specifier => {
        const dependency = await load(new URL(specifier, url));
        if (dependency.status === 'unlinked') await dependency.link(resolveModule);
        if (dependency.status === 'linked') await dependency.evaluate();
        return dependency;
      },
    });
    modules.set(url.href, module);
    return module;
  }
  // Let VM link a complete module graph once. Recursively linking each child
  // races on shared dependencies (for example Header used by shell and footer).
  async function resolveModule(specifier, referencingModule) {
      const url = new URL(referencingModule.identifier);
      if (specifier.startsWith('.')) {
        const dependency = new URL(specifier, url);
        if (!/\.(js|jsx|mjs)$/.test(dependency.pathname)) {
          const { existsSync } = await import('node:fs');
          dependency.pathname += existsSync(new URL(dependency.href + '.jsx')) ? '.jsx' : '.js';
        }
        return load(dependency);
      }
      if (modules.has('package:' + specifier)) return modules.get('package:' + specifier);
      const dependency = await import(specifier);
      const module = new SyntheticModule(Object.keys(dependency), function () {
        for (const [key, value] of Object.entries(dependency)) this.setExport(key, value);
      }, { context });
      modules.set('package:' + specifier, module);
      return module;
  }
  const module = await load(entry);
  await module.link(resolveModule);
  await module.evaluate();
  return module.namespace;
}
