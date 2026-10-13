import { orderCalendarYear } from '../lib/orderYears';

export function OrderYearSelect({ value, years = [], onChange, disabled = false }) {
  const options = [...new Set([orderCalendarYear(new Date().toISOString()), ...years.map(entry => String(entry.year)), ...(value === 'all' ? [] : [value])])].sort((left, right) => right.localeCompare(left));
  return <label className="orders-year-field"><span>Order year</span><select aria-label="Filter orders by year" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="all">All years</option>{options.map(year => <option key={year} value={year}>{year}</option>)}</select></label>;
}
