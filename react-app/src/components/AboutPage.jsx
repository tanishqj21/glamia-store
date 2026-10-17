import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { WibrawlTimeline } from './WibrawlTimeline';

export function AboutTimeline({ page, preview = false }) {
  return <div className={`about-story${preview ? " is-preview" : ""}`}>
    <header className="about-story-intro"><p className="about-story-eyebrow">{page.eyebrow}</p><h1>{page.headline}</h1><p>{page.introduction}</p></header>
    <ol className="about-timeline">{(page.timeline || []).map((moment, index) => <li className="about-moment" key={moment.id || index}><div className="about-moment-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div><div className="about-moment-copy"><p className="about-moment-period">{moment.period}</p><h2>{moment.title}</h2><p>{moment.body}</p></div></li>)}</ol>
    {!preview && <p className="about-story-signoff">The next chapter is yours.</p>}
  </div>;
}

export default function AboutPage({ brandName = "Glamia" }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch("/api/about").then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "About us could not be loaded");
      if (active) {
        setPage(data);
        document.title = `${data.headline} | ${brandName}`;
        const description = document.querySelector('meta[name="description"]');
        if (description) description.setAttribute("content", data.introduction);
      }
    }).catch(reason => { if (active) setError(reason.message || "About us could not be loaded"); });
    return () => { active = false; };
  }, [attempt, brandName]);
  if (error) return <main className="about-story-state"><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button></main>;
  if (!page) return <main className="about-story-state" role="status">Loading our story…</main>;
  return <main>{brandName === 'Wibrawl' ? <WibrawlTimeline page={page} /> : <AboutTimeline page={page} />}</main>;
}
