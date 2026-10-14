import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { istDateTimeInput, parseISTInput } from '../../../src/time-zone.js';
import { formatIST } from "../lib/commerce";

const EVENT_TYPES = [
  ["sale", "Sale"],
  ["launch", "Product launch"],
  ["seasonal", "Seasonal moment"],
  ["announcement", "Announcement"],
  ["campaign", "Campaign"]
];

const EVENT_THEMES = [
  ["evergreen", "Evergreen"],
  ["terracotta", "Terracotta"],
  ["cobalt", "Cobalt"],
  ["plum", "Plum"],
  ["sand", "Sand"],
  ["graphite", "Graphite"],
  ["festival", "Festival"],
  ["aurora", "Aurora"],
  ["sunset", "Sunset"],
  ["prism", "Prism"],
  ["spotlight", "Spotlight"]
];

const SHOPPING_DESTINATIONS = [
  ["/", "Home / New in"],
  ["/offers", "Offers"],
  ["/just-arrived", "Just arrived"],
  ["/best-sellers", "Best sellers"]
];

const INFORMATION_DESTINATIONS = [
  ["/track-order", "Track an order"],
  ["/contact", "Contact us"],
  ["/support", "Customer support"],
  ["/policies", "All policies"],
  ["/terms-and-conditions", "Terms & conditions"],
  ["/privacy-policy", "Privacy policy"],
  ["/refund-cancellation-policy", "Refund & cancellation policy"],
  ["/return-policy", "Return policy"],
  ["/shipping-policy", "Shipping policy"]
];

const ACCOUNT_DESTINATIONS = [
  ["/login", "Sign in"],
  ["/profile", "Your account"],
  ["/address", "Saved addresses"],
  ["/orders", "Your orders"],
  ["/wishlist", "Wishlist"],
  ["/reviews", "Your reviews"],
  ["/cart", "Shopping bag"],
  ["/checkout", "Checkout"]
];

function categoryDestination(category, subcategory = "") {
  const path = `/category/${encodeURIComponent(category)}`;
  return subcategory ? `${path}?${new URLSearchParams({ sub: subcategory })}` : path;
}

const EMPTY_EVENT = {
  name: "",
  type: "sale",
  status: "draft",
  theme: "evergreen",
  headline: "",
  message: "",
  coupon_code: "",
  cta_label: "Shop the offer",
  cta_href: "/offers",
  starts_at: "",
  ends_at: "",
  show_on_home: true,
  show_after_sign_in: true,
  show_once: true,
  notify_customers: false
};

const inputDate = istDateTimeInput;

function storedDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = parseISTInput(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : text;
}

function editEvent(event) {
  return {
    ...EMPTY_EVENT,
    ...event,
    starts_at: inputDate(event.starts_at),
    ends_at: inputDate(event.ends_at),
    show_on_home: event.show_on_home !== false,
    show_after_sign_in: event.show_after_sign_in !== false,
    show_once: event.show_once !== false,
    notify_customers: Boolean(event.notify_customers)
  };
}

function eventDate(value) {
  return value ? formatIST(value) : "Any time";
}

function eventStatusLabel(event) {
  if (event.status === "archived") return "Archived";
  if (event.lifecycle === "upcoming") return "Upcoming";
  if (event.lifecycle === "ended") return "Ended";
  if (event.status === "published") return "Live";
  return "Draft";
}

function eventWindow(event) {
  if (!event.starts_at && !event.ends_at) return "No scheduled end";
  if (!event.starts_at) return `Until ${eventDate(event.ends_at)}`;
  if (!event.ends_at) return `From ${eventDate(event.starts_at)}`;
  return `${eventDate(event.starts_at)} – ${eventDate(event.ends_at)}`;
}

function eventBucket(event) {
  if (event.status === "archived") return "archived";
  return event.lifecycle || event.status || "draft";
}

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

function EventPreview({ event }) {
  return <aside className={`event-preview event-theme-${event.theme || "evergreen"}`} aria-label="Storefront event preview">
    <div className="event-preview-top"><span className="event-preview-kicker">GLAMIA / {EVENT_TYPES.find(([value]) => value === event.type)?.[1] || "The edit"}</span><span className="event-preview-asterisk" aria-hidden="true">✳</span></div>
    <div className="event-preview-copy"><span className="event-preview-overline">A moment worth opening</span><h3>{event.headline || "Your next big moment starts here."}</h3><p>{event.message || "Give shoppers a clear reason to explore while your event is live."}</p></div>
    <div className="event-preview-bottom">{event.coupon_code && <div className="event-preview-code"><small>USE CODE</small><strong>{event.coupon_code}</strong></div>}<div className="event-preview-footer"><span>{event.cta_label || "Shop the offer"} </span><small>{eventWindow(event)}</small></div></div>
  </aside>;
}

export function EventsView({ categories = [], subcategories = [] }) {
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState(EMPTY_EVENT);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState("overview");
  const [filter, setFilter] = useState("all");
  const categoryDestinations = useMemo(() => categories.filter(Boolean).map((category) => [categoryDestination(category), `All ${category}`]), [categories]);
  const subcategoryDestinations = useMemo(() => subcategories.filter((item) => item?.category && item?.name).map((item) => [categoryDestination(item.category, item.name), `${item.name} · ${item.category}`]), [subcategories]);
  const destinationGroups = [["Shopping pages", SHOPPING_DESTINATIONS], ["Categories", categoryDestinations], ["Subcategories", subcategoryDestinations], ["Help & policies", INFORMATION_DESTINATIONS], ["Account & shopping bag", ACCOUNT_DESTINATIONS]];
  const destinationPaths = new Set(destinationGroups.flatMap(([, options]) => options.map(([path]) => path)));
  const selectedDestination = destinationPaths.has(draft.cta_href) ? draft.cta_href : "custom";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await readResponse(await apiFetch("/api/admin/events"), "Events could not be loaded");
      setEvents(data.events || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Keep the dashboard and its filters derived from the current server snapshot.
  const counts = useMemo(() => ({ live: events.filter((item) => eventBucket(item) === "live").length, upcoming: events.filter((item) => eventBucket(item) === "upcoming").length, draft: events.filter((item) => eventBucket(item) === "draft").length, archived: events.filter((item) => ["archived", "ended"].includes(eventBucket(item))).length }), [events]);
  const visibleEvents = useMemo(() => events.filter((item) => filter === "all" || (filter === "past" ? ["archived", "ended"].includes(eventBucket(item)) : eventBucket(item) === filter)), [events, filter]);
  const spotlight = events.find((item) => eventBucket(item) === "live" && item.show_on_home) || events.find((item) => eventBucket(item) === "upcoming" && item.show_on_home) || events.find((item) => eventBucket(item) === "live") || events.find((item) => eventBucket(item) === "upcoming") || null;

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setDraft((current) => ({ ...current, [name]: type === "checkbox" ? checked : name === "coupon_code" ? value.toUpperCase() : value }));
  }

  function startNew() {
    setEditingId("");
    setDraft(EMPTY_EVENT);
    setError("");
    setMessage("");
    setView("editor");
  }

  function startEdit(event) {
    setEditingId(event.id);
    setDraft(editEvent(event));
    setError("");
    setMessage("");
    setView("editor");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicate(event) {
    setEditingId("");
    setDraft({ ...editEvent(event), name: `${event.name} copy`, status: "draft", notify_customers: false });
    setError("");
    setMessage("Duplicate ready to save as a draft.");
    setView("editor");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const original = events.find((item) => item.id === editingId);
      // The editor displays seconds; copy edits must retain stored fractional precision.
      const scheduleDate = (value, saved) => original && value === inputDate(saved) ? saved || "" : storedDate(value);
      const payload = { ...draft, starts_at: scheduleDate(draft.starts_at, original?.starts_at), ends_at: scheduleDate(draft.ends_at, original?.ends_at) };
      const response = await apiFetch(editingId ? `/api/admin/events/${encodeURIComponent(editingId)}` : "/api/admin/events", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      const data = await readResponse(response, "Event could not be saved");
      setEvents((current) => editingId ? current.map((item) => item.id === editingId ? data.event : item) : [data.event, ...current]);
      setEditingId(data.event.id);
      setDraft(editEvent(data.event));
      setMessage(`${data.event.name} saved.`);
      setView("overview");
      setFilter("all");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function archive(event) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(`/api/admin/events/${encodeURIComponent(event.id)}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
      const data = await readResponse(response, "Event could not be archived");
      setEvents((current) => current.map((item) => item.id === event.id ? data.event : item));
      if (editingId === event.id) setDraft(editEvent(data.event));
      setMessage(`${event.name} archived.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(event) {
    if (!window.confirm(`Delete “${event.name}”? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await readResponse(await apiFetch(`/api/admin/events/${encodeURIComponent(event.id)}`, { method: "DELETE" }), "Event could not be deleted");
      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (editingId === event.id) startNew();
      setMessage(`${event.name} deleted.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-panel admin-wide-panel events-workspace">
    <header className="events-page-header"><div><p className="eyebrow">Glamia / moments studio</p><h2>Make a moment<br /><em>of it.</em></h2><p>Build a campaign, choose where it appears, and know exactly when it goes live.</p></div><button type="button" className="events-create-button" onClick={startNew}>Create an event</button></header>
    <div className="events-page-tabs" role="group" aria-label="Events workspace"><button type="button" className={view === "overview" ? "is-active" : ""} aria-pressed={view === "overview"} onClick={() => setView("overview")}>Overview</button><button type="button" className={view === "editor" ? "is-active" : ""} aria-pressed={view === "editor"} onClick={() => setView("editor")}>{editingId ? "Edit event" : "Event editor"}</button></div>
    {(error || message) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || message}</p>}
    {view === "overview" ? <>
      <div className="events-metrics" aria-label="Event summary"><div><span className="events-metric-dot is-live" /><strong>{counts.live}</strong><span>Live now</span></div><div><span className="events-metric-dot is-upcoming" /><strong>{counts.upcoming}</strong><span>Scheduled</span></div><div><span className="events-metric-dot is-draft" /><strong>{counts.draft}</strong><span>Drafts</span></div><div><span className="events-metric-dot is-past" /><strong>{counts.archived}</strong><span>Past & archived</span></div></div>
      <section className="events-spotlight" aria-label="Featured event"><div className="events-spotlight-copy"><span className="events-section-index">01 / CURRENT MOMENT</span><h3>{spotlight ? eventBucket(spotlight) === "live" ? (spotlight.show_on_home ? "On the storefront now." : "Welcoming signed-in shoppers.") : "Coming up next." : "Your next story starts here."}</h3><p>{spotlight ? `${spotlight.name} · ${eventWindow(spotlight)}` : "Create an event to give your next sale, launch, or announcement a home."}</p><button type="button" className="events-inline-link" onClick={() => spotlight ? startEdit(spotlight) : startNew()}>{spotlight ? "Edit this event" : "Create your first event"}</button></div><EventPreview event={spotlight || EMPTY_EVENT} /></section>
      <section className="events-list-section"><div className="events-list-heading"><div><span className="events-section-index">02 / YOUR CALENDAR</span><h3>All events</h3></div><span>{events.length} saved</span></div><div className="events-filters" role="group" aria-label="Filter events">{[["all", "All"], ["live", "Live"], ["upcoming", "Scheduled"], ["draft", "Drafts"], ["past", "Past"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>{loading ? <div className="loading-card" role="status">Loading events…</div> : <div className="events-list">{visibleEvents.map((item) => <article className="event-row" key={item.id}><div className={`event-row-swatch event-theme-${item.theme}`} aria-hidden="true"><span>✳</span></div><div className="event-row-main"><div className="event-row-title"><span className={`event-status event-status-${eventBucket(item)}`}>{eventStatusLabel(item)}</span><small>{EVENT_TYPES.find(([value]) => value === item.type)?.[1] || "Campaign"}</small></div><h4>{item.name}</h4><p>{item.headline}</p><small>{eventWindow(item)}{item.coupon_code ? ` · ${item.coupon_code}` : ""}</small></div><div className="event-row-actions"><button type="button" className="events-row-primary" onClick={() => startEdit(item)} disabled={busy}>Edit</button><button type="button" onClick={() => duplicate(item)} disabled={busy}>Duplicate</button>{item.status !== "archived" && <button type="button" onClick={() => archive(item)} disabled={busy}>Archive</button>}<button type="button" className="danger-link" onClick={() => remove(item)} disabled={busy}>Delete</button></div></article>)}{!visibleEvents.length && <div className="events-empty"><span aria-hidden="true">✳</span><h4>{events.length ? "Nothing in this view yet." : "A blank calendar is full of possibilities."}</h4><p>{events.length ? "Try another filter or create something new." : "Start with a launch, a seasonal edit, or an offer your customers will remember."}</p><button type="button" onClick={startNew}>Create an event</button></div>}</div>}</section>
    </> : <div className="events-studio-grid"><form className="events-editor" onSubmit={save}><div className="events-editor-heading"><div><span className="events-section-index">{editingId ? "EDIT THE MOMENT" : "NEW MOMENT"}</span><h3>{editingId ? draft.name || "Your event" : "The details."}</h3><p>Shape what shoppers see, then choose when and where it appears.</p></div><span className={`event-lifecycle event-lifecycle-${draft.status}`}>{draft.status}</span></div>
      <section className="events-form-section"><div className="events-form-section-title"><span>01</span><div><h4>The story</h4><p>Keep the customer copy short and clear.</p></div></div><div className="events-form-grid"><label><span>Internal event name</span><input name="name" value={draft.name} onChange={updateField} maxLength="80" placeholder="The festive edit" required /></label><label><span>Event type</span><select name="type" value={draft.type} onChange={updateField}>{EVENT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="events-field-wide"><span>Storefront headline</span><input name="headline" value={draft.headline} onChange={updateField} maxLength="90" placeholder="A little more to love" required /></label><label className="events-field-wide"><span>Customer-facing message</span><textarea name="message" value={draft.message} onChange={updateField} maxLength="260" rows="3" placeholder="Tell customers why this moment is worth opening." required /></label></div></section>
      <section className="events-form-section">
        <div className="events-form-section-title"><span>02</span><div><h4>Make it yours</h4><p>Choose from six signature tones or five multicolour sale palettes.</p></div></div>
        <fieldset className="events-theme-picker"><legend>Event theme</legend>{EVENT_THEMES.map(([value, label]) => <label key={value} className={draft.theme === value ? "is-selected" : ""}><input type="radio" name="theme" value={value} checked={draft.theme === value} onChange={updateField} /><span className={`events-theme-swatch event-theme-${value}`} aria-hidden="true" /><span>{label}</span></label>)}</fieldset>
        <div className="events-form-grid">
          <label><span>Coupon code <small>optional</small></span><input name="coupon_code" value={draft.coupon_code} onChange={updateField} maxLength="24" placeholder="FESTIVE20" /></label>
          <label><span>Button label</span><input name="cta_label" value={draft.cta_label} onChange={updateField} maxLength="40" placeholder="Shop the offer" /></label>
          <label className="events-field-wide">
            <span id="event-button-destination-label">Button destination</span>
            <select aria-labelledby="event-button-destination-label" aria-describedby="event-button-destination-hint" value={selectedDestination} onChange={(event) => setDraft((current) => ({ ...current, cta_href: event.target.value === "custom" ? "" : event.target.value }))}>
              {destinationGroups.filter(([, options]) => options.length > 0).map(([group, options]) => <optgroup key={group} label={group}>{options.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</optgroup>)}
              <option value="custom">Custom page path…</option>
            </select>
            <small id="event-button-destination-hint">Categories update automatically from your catalog. Account pages may require shoppers to sign in.</small>
          </label>
          {selectedDestination === "custom" && <label className="events-field-wide"><span>Custom page path</span><input name="cta_href" value={draft.cta_href} onChange={updateField} maxLength="180" placeholder="/category/Women" pattern="/(?!/).*" title="Enter an internal path beginning with /" required /></label>}
        </div>
      </section>
      <section className="events-form-section"><div className="events-form-section-title"><span>03</span><div><h4>Timing & placement</h4><p>Publish now or set a future window.</p></div></div><div className="events-form-grid"><label><span>Publishing state</span><select name="status" value={draft.status} onChange={updateField}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label><span>Starts at <small>IST · optional</small></span><input type="datetime-local" step="1" name="starts_at" value={draft.starts_at} onChange={updateField} /></label><label><span>Ends at <small>IST · optional</small></span><input type="datetime-local" step="1" name="ends_at" min={draft.starts_at || undefined} value={draft.ends_at} onChange={updateField} /></label></div><div className="events-options"><label><input type="checkbox" name="show_on_home" checked={draft.show_on_home} onChange={updateField} /><span><strong>Show on the storefront</strong><small>Feature this event on the website and Store app home screens.</small></span></label><label><input type="checkbox" name="show_after_sign_in" checked={draft.show_after_sign_in} onChange={updateField} /><span><strong>Show after sign-in</strong><small>Welcome returning website shoppers with this event.</small></span></label><label><input type="checkbox" name="show_once" checked={draft.show_once} onChange={updateField} /><span><strong>Only once per device</strong><small>Remember when the sign-in message has already appeared.</small></span></label><label><input type="checkbox" name="notify_customers" checked={draft.notify_customers} onChange={updateField} /><span><strong>Notify opted-in shoppers</strong><small>Send one push alert when this event goes live. Shoppers can turn event alerts off in the Store app.</small></span></label></div><p className="form-hint">A published event appears during its date window. When windows overlap, the most recent active event takes priority.</p></section>
      <div className="events-save-bar"><button type="submit" className="primary-action" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Create event"} </button><button type="button" className="secondary-action" onClick={() => setView("overview")} disabled={busy}>Back to overview</button></div></form><div className="events-preview-column"><div className="events-preview-heading"><span className="events-section-index">LIVE PREVIEW</span><p>How this event will appear on the storefront.</p></div><EventPreview event={draft} /><p className="events-preview-note">Preview only · Changes appear to shoppers after you save and the event is live.</p></div></div>}
  </section>;
}
