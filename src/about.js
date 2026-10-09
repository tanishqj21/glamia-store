const MAX_MILESTONES = 12;

function cleanText(value, label, maxLength, required = true) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength || (required && !text)) {
    throw Object.assign(new Error(`${label} must be ${required ? "1" : "0"}–${maxLength} characters`), { status: 400 });
  }
  return text;
}

export async function readAboutPage(env) {
  const row = await env.DB.prepare("SELECT eyebrow, headline, introduction, timeline_json, updated_at FROM about_page WHERE id = 1").first();
  if (!row) throw Object.assign(new Error("About page is not configured"), { status: 500 });
  let timeline;
  try { timeline = JSON.parse(row.timeline_json); } catch { timeline = []; }
  return { eyebrow: row.eyebrow, headline: row.headline, introduction: row.introduction, timeline: Array.isArray(timeline) ? timeline : [], updated_at: row.updated_at };
}

export async function saveAboutPage(env, input, actorEmail) {
  const eyebrow = cleanText(input.eyebrow, "Eyebrow", 60);
  const headline = cleanText(input.headline, "Headline", 120);
  const introduction = cleanText(input.introduction, "Introduction", 600);
  if (!Array.isArray(input.timeline) || input.timeline.length < 1 || input.timeline.length > MAX_MILESTONES) {
    throw Object.assign(new Error(`Add between 1 and ${MAX_MILESTONES} timeline moments`), { status: 400 });
  }
  const ids = new Set();
  const timeline = input.timeline.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw Object.assign(new Error("Invalid timeline moment"), { status: 400 });
    const id = cleanText(item.id, `Moment ${index + 1} ID`, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw Object.assign(new Error("Timeline moment IDs must be unique"), { status: 400 });
    ids.add(id);
    return {
      id,
      period: cleanText(item.period, `Moment ${index + 1} period`, 80, false),
      title: cleanText(item.title, `Moment ${index + 1} title`, 140),
      body: cleanText(item.body, `Moment ${index + 1} text`, 1000)
    };
  });
  await env.DB.prepare("UPDATE about_page SET eyebrow = ?, headline = ?, introduction = ?, timeline_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
    .bind(eyebrow, headline, introduction, JSON.stringify(timeline), String(actorEmail || "").toLowerCase()).run();
  return readAboutPage(env);
}
