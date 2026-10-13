const yearFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kolkata' });

export function orderCalendarYear(value) {
  const source = String(value || '').replace(' ', 'T');
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(source) ? source : source + 'Z');
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
