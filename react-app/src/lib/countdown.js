export function countdownText(endsAt, now = Date.now()) {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return '';
  const total = Math.max(0, Math.ceil((end - now) / 1000));
  if (!total) return 'Event ended';
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return `Ends in ${days ? days + 'd ' : ''}${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}
