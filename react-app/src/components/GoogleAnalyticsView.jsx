import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  const maxDailyViews = useMemo(() => Math.max(1, ...daily.map((item) => Number(item.page_views || 0))), [daily]);

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
            <section className="google-analytics-daily">
              <div className="google-analytics-list-heading">
                <p className="eyebrow">Traffic trend</p>
                <span>Page views by day</span>
              </div>
              {daily.length ? (
                <div className="google-analytics-daily-chart" role="img" aria-label="Google Analytics page views by day">
                  {daily.map((item, index) => {
                    const value = Number(item.page_views || 0);
                    const height = Math.max(5, (value / maxDailyViews) * 100);
                    return <div className="google-analytics-day" key={item.date || index} title={`${dateLabel(item.date)}: ${count(value)} page views`}><span>{count(value)}</span><i style={{ height: `${height}%` }} /><small>{index % 3 === 0 || index === daily.length - 1 ? dateLabel(item.date) : ""}</small></div>;
                  })}
                </div>
              ) : <div className="empty-state">No Google Analytics data yet.</div>}
            </section>
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

