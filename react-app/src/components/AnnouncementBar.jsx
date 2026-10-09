import React, { useEffect, useState } from 'react';
import { activeAnnouncements, nextAnnouncementBoundary } from '../lib/announcements';

export function AnnouncementBar({ announcement }) {
  // Public settings already contain only active notices. Keep the initial
  // server-rendered message until mounting, then enforce expiry locally too.
  const [now, setNow] = useState(null);
  useEffect(() => {
    let timer;
    const update = () => {
      const time = Date.now();
      setNow(time);
      window.clearTimeout(timer);
      const boundary = nextAnnouncementBoundary(announcement, time);
      if (boundary !== null) timer = window.setTimeout(update, Math.min(boundary - time + 25, 2147483647));
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', update); };
  }, [announcement]);
  const permanent = String(announcement?.text || '').trim();
  if (announcement?.visible === false || !permanent) return null;
  const notices = now === null ? (announcement?.items || []).filter(item => String(item.text || '').trim()) : activeAnnouncements(announcement, now);
  if (!notices.length) return <div className="announce" role="status" aria-live="polite"><span className="announce-message">{permanent}</span></div>;
  const text = notices.map(item => String(item.text).trim()).join(' · ');
  return <div className="announce announce-scrolling" role="status" aria-live="polite" tabIndex={0}
    onPointerDown={event => { if (event.pointerType === 'touch') event.currentTarget.focus({ preventScroll: true }); }}>
    <span className="sr-only">{text}</span>
    <div className="announce-window" aria-hidden="true"><div className="announce-track" key={text}>
      {[0, 1].map(group => <div className="announce-group" key={group}>{[0, 1, 2].map(copy => <span className="announce-copy" key={copy}><span className="announce-sparkle">✦</span>{text}<span className="announce-sparkle">✧</span></span>)}</div>)}
    </div></div>
  </div>;
}
