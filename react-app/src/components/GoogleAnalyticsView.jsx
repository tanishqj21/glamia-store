import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const numberFormatter = new Intl.NumberFormat("en-IN");

function count(value) {
  return numberFormatter.format(Math.max(0, Math.round(Number(value) || 0)));
}

function percentage(value) {
  return `${Math.round(Math.max(0, Number(value) || 0) * 100)}%`;
}

function dateLabel(value) {
  const raw = String(value || "");
  if (!/^\d{8}$/.test(raw)) return raw;
  const date = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00+05:30`);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

function pageLabel(path) {
  const value = String(path || "/");
  return value === "/" ? "Home" : value;
}

const ANALYTICS_CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899",
  "#14b8a6", "#f97316", "#8b5cf6", "#84cc16", "#06b6d4", "#eab308",
];

function analyticsChartColor(index) {
  return ANALYTICS_CHART_COLORS[index % ANALYTICS_CHART_COLORS.length];
}

function AnalyticsTrafficChart({ daily }) {
  const [view, setView] = useState("bar");
  const [hovered, setHovered] = useState(-1);
  const [selected, setSelected] = useState(-1);
  const values = useMemo(() => daily.map((item) => Math.max(0, Number(item.page_views || 0))), [daily]);
  const max = Math.max(1, ...values);
  const activeIndex = hovered >= 0 ? hovered : selected;
  const activeItem = activeIndex >= 0 ? daily[activeIndex] : null;
  const activeValue = activeIndex >= 0 ? values[activeIndex] : 0;
  const chartWidth = Math.max(620, daily.length * 34);
  const chartBaseline = 176;
  const chartHeight = 132;
  const chartPadding = 24;
  const points = daily.map((item, index) => {
    const x = daily.length > 1
      ? chartPadding + (index / (daily.length - 1)) * (chartWidth - chartPadding * 2)
      : chartWidth / 2;
    const y = chartBaseline - (values[index] / max) * chartHeight;
    return { item, index, x, y, value: values[index] };
  });
  const linePoints = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const select = (index) => {
    setSelected((current) => (current === index ? -1 : index));
    setHovered(index);
  };
  const selectOnKey = (event, index) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select(index);
  };
  const pointLabel = (item, value) => `${dateLabel(item.date)}: ${count(value)} page views`;

  return <section className="google-analytics-daily">
    <div className="google-analytics-list-heading">
      <div>
        <p className="eyebrow">Traffic trend</p>
        <span>Page views by day</span>
      </div>
      <div className="chart-heading-tools">
        <span className="chart-hint">Click a day for details</span>
        <div className="chart-toggle" role="group" aria-label="Google Analytics traffic chart type">
          <button type="button" className={view === "bar" ? "active" : ""} onClick={() => { setView("bar"); setHovered(-1); }}>Bars</button>
          <button type="button" className={view === "line" ? "active" : ""} onClick={() => { setView("line"); setHovered(-1); }}>Trend</button>
        </div>
      </div>
    </div>
    {activeItem && <div className="google-analytics-chart-callout" style={{ "--chart-color": analyticsChartColor(activeIndex) }} aria-live="polite"><i /><strong>{dateLabel(activeItem.date)}</strong><b>{count(activeValue)}</b><small>page views</small></div>}
    {daily.length ? view === "bar" ? (
      <div className="google-analytics-daily-chart" role="group" aria-label="Google Analytics page views by day">
        {daily.map((item, index) => {
          const value = values[index];
          const height = Math.max(5, (value / max) * 100);
          return <button type="button" className={`google-analytics-day chart-series-${index % ANALYTICS_CHART_COLORS.length} ${hovered === index ? "is-hovered" : ""} ${selected === index ? "is-selected" : ""}`} key={item.date || index} title={pointLabel(item, value)} aria-label={`Select ${pointLabel(item, value)}`} aria-pressed={selected === index} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(-1)} onFocus={() => setHovered(index)} onBlur={() => setHovered(-1)} onClick={() => select(index)} onKeyDown={(event) => selectOnKey(event, index)}><span>{count(value)}</span><i style={{ height: `${height}%` }} /><small>{index % 3 === 0 || index === daily.length - 1 ? dateLabel(item.date) : ""}</small></button>;
        })}
      </div>
    ) : (
      <div className="google-analytics-line-wrap" onMouseLeave={() => setHovered(-1)}>
        <svg className="google-analytics-line-chart" width={chartWidth} height="220" viewBox={`0 0 ${chartWidth} 220`} role="group" aria-label="Google Analytics page views trend by day">
          <defs>
            <linearGradient id="google-analytics-line-gradient" x1="0" x2="1" y1="0" y2="0">
              {ANALYTICS_CHART_COLORS.slice(0, 6).map((color, index) => <stop key={color} offset={`${index * 20}%`} stopColor={color} />)}
            </linearGradient>
            <linearGradient id="google-analytics-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity=".22" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((row) => {
            const y = chartBaseline - (row / 3) * chartHeight;
            return <line className="google-analytics-chart-gridline" key={row} x1={chartPadding} x2={chartWidth - chartPadding} y1={y} y2={y} />;
          })}
          <polygon className="google-analytics-line-area" points={`${chartPadding},${chartBaseline} ${linePoints} ${chartWidth - chartPadding},${chartBaseline}`} />
          <polyline className="google-analytics-line" points={linePoints} />
          {points.map(({ item, index, x, y, value }) => <g key={item.date || index} className={`google-analytics-line-point ${hovered === index ? "is-hovered" : ""} ${selected === index ? "is-selected" : ""}`} role="button" tabIndex="0" focusable="true" aria-label={`Select ${pointLabel(item, value)}`} aria-pressed={selected === index} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onClick={() => select(index)} onKeyDown={(event) => selectOnKey(event, index)}><circle cx={x} cy={y} r={hovered === index || selected === index ? 6 : 4} style={{ "--chart-color": analyticsChartColor(index) }} /><title>{pointLabel(item, value)}</title>{(index % 3 === 0 || index === daily.length - 1) && <text x={x} y="204" textAnchor="middle">{dateLabel(item.date)}</text>}</g>)}
        </svg>
      </div>
    ) : <div className="empty-state">No Google Analytics data yet.</div>}
  </section>;
}

function AnalyticsList({ title, items, labelKey, metricKey, metricLabel }) {
  return (
    <section className="google-analytics-list">
      <div className="google-analytics-list-heading">
        <p className="eyebrow">{title}</p>
        <span>{items.length} shown</span>
      </div>
      {items.length ? (
        <div className="insight-list">
          {items.map((item) => (
            <div key={`${item[labelKey]}-${item[metricKey]}`}>
              <span title={String(item[labelKey] || "")}>{item[labelKey]}</span>
              <b>{count(item[metricKey])} <small>{metricLabel}</small></b>
            </div>
          ))}
        </div>
      ) : <div className="empty-state">No Google Analytics data yet.</div>}
    </section>
  );
}

export function GoogleAnalyticsView() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  const load = useCallback(async (cacheTtl = 0) => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await apiFetch("/api/admin/google-analytics", { cacheTtl });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Google Analytics could not be loaded");
      setState({ loading: false, data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error.message || "Google Analytics could not be loaded" });
    }
  }, []);

  useEffect(() => {
    load(300000);
  }, [load]);

  const data = state.data;
  const summary = data?.summary || {};
  const daily = data?.daily || [];

  return (
    <section className="dashboard-section google-analytics-section" aria-labelledby="google-analytics-heading">
      <div className="dashboard-section-heading google-analytics-heading">
        <div>
          <p className="eyebrow">External analytics</p>
          <h2 id="google-analytics-heading">Google Analytics 4</h2>
        </div>
        <div className="google-analytics-heading-actions">
          <span className="dashboard-section-note">
            {data?.configured ? "Last 30 complete days" : "Optional connection"}
          </span>
          {data?.configured && (
            <button className="secondary-action" type="button" onClick={() => load()} disabled={state.loading}>
              {state.loading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {state.loading && <div className="google-analytics-status">Loading Google Analytics data…</div>}

      {!state.loading && state.error && (
        <div className="google-analytics-status is-error" role="alert">
          <strong>Google Analytics is temporarily unavailable.</strong>
          <span>{state.error}</span>
          <button className="secondary-action" type="button" onClick={() => load()}>
            Try again
          </button>
        </div>
      )}

      {!state.loading && !state.error && data && !data.configured && (
        <div className="google-analytics-setup">
          <div>
            <strong>Connect GA4 when you are ready</strong>
            <p>{data.setup}</p>
            <p className="form-hint">The private key is used only by the Worker. Add the service account as a Viewer on the GA4 property before testing the connection.</p>
          </div>
          <div className="google-analytics-config-list" aria-label="Required Worker configuration">
            {(data.missing || ["GA4_PROPERTY_ID", "GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY"]).map((name) => <code key={name}>{name}</code>)}
          </div>
        </div>
      )}

      {!state.loading && !state.error && data?.configured && (
        <>
          <div className="google-analytics-meta">
            <span>Property {data.property_id}</span>
            <span>Fetched {data.fetched_at ? new Date(data.fetched_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "just now"}</span>
          </div>
          <div className="google-analytics-metric-grid">
            <article><span>Active users</span><strong>{count(summary.active_users)}</strong><small>unique active users</small></article>
            <article><span>New users</span><strong>{count(summary.new_users)}</strong><small>first-time users</small></article>
            <article><span>Sessions</span><strong>{count(summary.sessions)}</strong><small>visits to the site</small></article>
            <article><span>Page views</span><strong>{count(summary.page_views)}</strong><small>screen page views</small></article>
            <article><span>Bounce rate</span><strong>{percentage(summary.bounce_rate)}</strong><small>sessions without engagement</small></article>
            <article><span>Engagement rate</span><strong>{percentage(summary.engagement_rate)}</strong><small>engaged sessions</small></article>
          </div>
          <div className="google-analytics-detail-grid">
            <AnalyticsTrafficChart daily={daily} />
            <AnalyticsList title="Top pages" items={(data.top_pages || []).map((item) => ({ ...item, path: pageLabel(item.path) }))} labelKey="path" metricKey="page_views" metricLabel="views" />
          </div>
          <div className="google-analytics-detail-grid google-analytics-audience-grid">
            <AnalyticsList title="Acquisition channels" items={data.channels || []} labelKey="channel" metricKey="sessions" metricLabel="sessions" />
            <AnalyticsList title="Devices" items={data.devices || []} labelKey="device" metricKey="active_users" metricLabel="users" />
          </div>
          <p className="google-analytics-note">GA4 values can differ from Glamia’s first-party page-view counter because of consent, deduplication, reporting identity, filters, and property timezone settings.</p>
        </>
      )}
    </section>
  );
}
