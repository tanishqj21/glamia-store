import React from 'react';

const paths = {
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  bag: <><path d="M5 8.5h14l-1 11H6l-1-11Z" /><path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></>,
  facebook: <path d="M14.5 21v-8h2.7l.5-3h-3.2V8.1c0-1 .3-1.7 1.8-1.7h1.7V3.7c-.3 0-1.4-.2-2.6-.2-2.6 0-4.4 1.6-4.4 4.5V10H8v3h3v8h3.5Z" />,
  heart: <path d="M20.8 8.7c0 5.1-8.8 10.1-8.8 10.1S3.2 13.8 3.2 8.7A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.2Z" />,
  linkedin: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M7.2 10.2v6.6M7.2 7.5v.1M11.3 16.8v-3.6a2.6 2.6 0 0 1 5.2 0v3.6M11.3 10.2v6.6" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  moon: <path d="M20 15.3A8.2 8.2 0 0 1 8.7 4 8.2 8.2 0 1 0 20 15.3Z" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pinterest: <><circle cx="12" cy="12" r="9" /><path d="M10.2 16.8c.8-2.2 1-2.8 1-2.8a3.5 3.5 0 1 1 2.1 1.1c-.7 0-1.3-.3-1.7-.6" /><path d="M10.7 15.2c-.2-.9-.1-1.7.2-2.6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  tiktok: <path d="M15 4c.5 1.7 1.7 2.9 3.5 3.2v3.1c-1.3-.1-2.5-.5-3.5-1.2v5.3c0 3.3-2.4 5.6-5.5 5.6a5.4 5.4 0 1 1 .5-10.8v3.2a2.4 2.4 0 1 0 1 1.9V4H15Z" />,
  x: <><path d="M5 4.5 19 19.5M19 4.5 5 19.5" /></>,
  youtube: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" /></>,
};

export function Icon({ name, size = 18, className = "" }) {
  return <svg className={`ui-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.arrow}</svg>;
}
