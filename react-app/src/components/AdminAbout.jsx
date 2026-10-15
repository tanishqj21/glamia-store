import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { AboutTimeline } from "./AboutPage";

const newMoment = () => ({ id: `moment_${crypto.randomUUID().replaceAll("-", "")}`, period: "", title: "", body: "" });

export function AdminAboutView() {
  const [page, setPage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiFetch("/api/admin/about").then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load About us");
      if (active) setPage(data);
    }).catch(reason => { if (active) setError(reason.message || "Could not load About us"); });
    return () => { active = false; };
  }, []);
  const field = (name, value) => { setPage(current => ({ ...current, [name]: value })); setMessage(""); };
  const momentField = (index, name, value) => { setPage(current => ({ ...current, timeline: current.timeline.map((item, position) => position === index ? { ...item, [name]: value } : item) })); setMessage(""); };
  const move = (index, direction) => setPage(current => {
    const timeline = [...current.timeline];
    [timeline[index], timeline[index + direction]] = [timeline[index + direction], timeline[index]];
    return { ...current, timeline };
  });
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/api/admin/about", { method: "PUT", body: JSON.stringify(page) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save About us");
      setPage(data); setMessage("About us page saved and published.");
    } catch (reason) { setError(reason.message || "Could not save About us"); }
    finally { setBusy(false); }
  };
  if (!page) return <section className="admin-panel"><p role="status">{error || "Loading About us editor…"}</p></section>;
  return <section className="admin-panel admin-about">
    <div className="admin-section-heading"><div><p className="eyebrow">Shared · Glamia + WiBrawl</p><h2>About us</h2><p>Build the About us timeline shared by Glamia and WiBrawl. Saving updates both websites.</p></div><a href="/about" target="_blank" rel="noreferrer">View live page</a></div>
    <div className="admin-about-grid"><form onSubmit={save} className="admin-about-form">
      <label>Eyebrow<input value={page.eyebrow} maxLength={60} required onChange={event => field("eyebrow", event.target.value)} /></label>
      <label>Headline<input value={page.headline} maxLength={120} required onChange={event => field("headline", event.target.value)} /></label>
      <label>Introduction<textarea value={page.introduction} maxLength={600} required rows={4} onChange={event => field("introduction", event.target.value)} /></label>
      <div className="admin-about-timeline-heading"><div><h3>Timeline moments</h3><p>Add up to 12 moments. Use a year, chapter, or label in the period field.</p></div><button type="button" disabled={page.timeline.length >= 12} onClick={() => setPage(current => ({ ...current, timeline: [...current.timeline, newMoment()] }))}>Add moment</button></div>
      {page.timeline.map((moment, index) => <fieldset className="admin-about-moment" key={moment.id}><legend>Moment {String(index + 1).padStart(2, "0")}</legend>
        <div className="admin-about-moment-controls"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move moment ${index + 1} up`}>Move up</button><button type="button" disabled={index === page.timeline.length - 1} onClick={() => move(index, 1)} aria-label={`Move moment ${index + 1} down`}>Move down</button><button type="button" disabled={page.timeline.length === 1} onClick={() => setPage(current => ({ ...current, timeline: current.timeline.filter(item => item.id !== moment.id) }))}>Remove</button></div>
        <label>Period or chapter<input value={moment.period} maxLength={80} onChange={event => momentField(index, "period", event.target.value)} /></label>
        <label>Title<input value={moment.title} maxLength={140} required onChange={event => momentField(index, "title", event.target.value)} /></label>
        <label>Story<textarea value={moment.body} maxLength={1000} required rows={4} onChange={event => momentField(index, "body", event.target.value)} /></label>
      </fieldset>)}
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      <button className="primary-action" disabled={busy} type="submit">{busy ? "Saving…" : "Save About us page"}</button>
    </form><aside className="admin-about-preview"><p className="eyebrow">LIVE PREVIEW</p><AboutTimeline page={page} preview /></aside></div>
  </section>;
}
