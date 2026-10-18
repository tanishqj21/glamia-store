/** @jsxRuntime automatic */
import { useState } from 'react';

export function WibrawlTimeline({ page }) {
  const [active, setActive] = useState(0);
  return <div className="about-story wb-chronicle"><header className="about-story-intro"><p className="wibrawl-kicker">{page.eyebrow}</p><h1>{page.headline}</h1><p>{page.introduction}</p></header><ol className="about-timeline">{(page.timeline || []).map((moment, index) => <li key={moment.id || index} className={`about-moment ${active === index ? 'is-active' : ''}`}><button type="button" className="wb-chronicle-moment" aria-expanded={active === index} aria-controls={`wb-moment-${index}`} onClick={() => setActive(active === index ? -1 : index)}><span className="about-moment-number">{String(index + 1).padStart(2, '0')}</span><span><small>{moment.period}</small><strong>{moment.title}</strong></span><span aria-hidden="true">{active === index ? '−' : '+'}</span></button><div id={`wb-moment-${index}`} hidden={active !== index} className="wb-chronicle-body"><p>{moment.body}</p></div></li>)}</ol><p className="about-story-signoff">The next chapter is yours.</p></div>;
}
