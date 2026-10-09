import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { readAboutPage, saveAboutPage } from "../src/about.js";

test("About timeline reads seed, saves edits in order, and rejects invalid content", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0094_about_timeline.sql", import.meta.url), "utf8"));
  const env = { DB: { prepare(sql) {
    const args = [];
    return {
      bind(...values) { args.push(...values); return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { return db.prepare(sql).run(...args); }
    };
  } } };
  const initial = await readAboutPage(env);
  assert.equal(initial.timeline.length, 3);
  const reversed = [...initial.timeline].reverse();
  const saved = await saveAboutPage(env, { ...initial, headline: "Our evolving story", timeline: reversed }, "ADMIN@EXAMPLE.COM");
  assert.equal(saved.headline, "Our evolving story");
  assert.deepEqual(saved.timeline.map(item => item.id), reversed.map(item => item.id));
  assert.equal(db.prepare("SELECT updated_by FROM about_page WHERE id = 1").get().updated_by, "admin@example.com");
  await assert.rejects(saveAboutPage(env, { ...initial, timeline: [] }, "admin@example.com"), /between 1 and 12/);
  await assert.rejects(saveAboutPage(env, { ...initial, timeline: [reversed[0], reversed[0]] }, "admin@example.com"), /unique/);
  await assert.rejects(saveAboutPage(env, { ...initial, headline: "" }, "admin@example.com"), /Headline/);
  assert.equal((await readAboutPage(env)).headline, "Our evolving story");
});
