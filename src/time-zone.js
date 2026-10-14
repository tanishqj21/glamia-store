export const APP_TIME_ZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 330 * 60_000;

function parseTimestamp(value, defaultOffset) {
  if (value instanceof Date || typeof value === 'number') return new Date(value);
  const text = String(value || '').trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(text)) return new Date(NaN);
  const datetime = text.includes('T') ? text : text + 'T00:00:00';
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(datetime) ? datetime : datetime + defaultOffset);
}

// Existing SQLite timestamps describe UTC instants. Reading them must never
// depend on the runtime or visitor's local timezone.
export const parseStoredTimestamp = value => parseTimestamp(value, 'Z');
// A timezone-free scheduling input always describes the India wall clock.
export const parseISTInput = value => parseTimestamp(value, '+05:30');

export function toISTTimestamp(value) {
  const date = parseStoredTimestamp(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + IST_OFFSET_MS).toISOString().replace(/Z$/, '+05:30');
}

export const istDayKey = (value = new Date()) => toISTTimestamp(value).slice(0, 10);
export const istDateTimeInput = value => toISTTimestamp(value).slice(0, 19);

export function istTimestampReplacer(key, value) {
  if (typeof value !== 'string' || !/(?:_at|At|_until|Until|_time|Time|_timestamp|Timestamp|_date|Date)$|^(?:timestamp|time)$/.test(key)) return value;
  // Preserve dates of birth, day buckets, text and numeric protocol timestamps.
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) return value;
  return toISTTimestamp(value) || value;
}
