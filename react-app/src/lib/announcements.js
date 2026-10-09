export function activeAnnouncements(announcement, now = Date.now()) {
  return (Array.isArray(announcement?.items) ? announcement.items : []).filter(item => {
    const start = item.starts_at ? Date.parse(item.starts_at) : 0;
    const end = Date.parse(item.ends_at);
    return String(item.text || '').trim() && start <= now && end > now;
  });
}

export function nextAnnouncementBoundary(announcement, now = Date.now()) {
  const times = (announcement?.items || []).flatMap(item => [Date.parse(item.starts_at), Date.parse(item.ends_at)])
    .filter(time => Number.isFinite(time) && time > now);
  return times.length ? Math.min(...times) : null;
}
