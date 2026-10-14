import { APP_TIME_ZONE, parseStoredTimestamp } from '../../../src/time-zone.js';
const yearFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: APP_TIME_ZONE });

export function orderCalendarYear(value) {
  const date = parseStoredTimestamp(value);
  return Number.isNaN(date.getTime()) ? 'Unknown year' : yearFormatter.format(date);
}

export function groupOrdersByYear(orders) {
  const groups = new Map();
  for (const order of orders) {
    const year = orderCalendarYear(order.created_at);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(order);
  }
  return [...groups].sort(([left], [right]) => right.localeCompare(left)).map(([year, records]) => ({ year, orders: records }));
}
