import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, formatIST, productUrl } from "../lib/commerce";
import { AfterSalesDialog } from "./CustomerCare";
import { PhoneField, composePhone, splitPhone } from "./PhoneField";
import { MyReviewsPanel } from "./Reviews";


function addressLine(address) {
  return [address.line1, address.line2, address.city, address.state, address.pin, address.country || "India"]
    .filter(Boolean)
    .join(", ");
}

function capitalizeNamePart(value) {
  const text = String(value || "").trim();
  return text.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function calculateAge(value) {
  if (!value) return null;
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed = today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

const CANCELLATION_WINDOW_DAYS = 2;

function cancellationWindowOpen(order) {
  const createdAt = Date.parse(order?.created_at || "");
  return !Number.isFinite(createdAt) || Date.now() - createdAt <= CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function profileGenderLabel(value) {
  return ({ female: "Female", male: "Male", non_binary: "Non-binary", prefer_not_to_say: "Prefer not to say" })[value] || "Not set";
}

function profileForm(data = {}, requirePhone = false) {
  const phones = Array.isArray(data.phones) && data.phones.length
    ? data.phones.map((item) => ({ id: item.id, label: item.label || "", country_code: item.country_code || "+91", phone_number: item.phone_number || item.phone || "", is_primary: Boolean(item.is_primary) }))
    : data.phone ? (() => { const parsed = splitPhone(data.phone); return [{ id: "primary", label: "", country_code: parsed.countryCode, phone_number: parsed.number, is_primary: true }]; })() : [];
  if (requirePhone && !phones.length) phones.push({ id: "primary", label: "", country_code: "+91", phone_number: "", is_primary: true });
  return { first_name: data.first_name || "", middle_name: data.middle_name || "", last_name: data.last_name || "", dob: data.dob || "", gender: data.gender || "", phones };
}

function AccountNav({ route, onNavigate }) {
  const links = [
    ["/profile", "Profile"],
    ["/address", "Address book"],
    ["/orders", "Your orders"],
    ["/wishlist", "Wishlist"],
    ["/reviews", "Reviews"],
  ];

  return (
    <nav className="account-nav" aria-label="Account sections">
      {links.map(([href, label]) => (
        <button key={href} type="button" className={route === href ? "active" : ""} onClick={() => onNavigate(href)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

function AccountLayout({ route, onNavigate, title, eyebrow = "Account", children }) {
  return (
    <main className="page-main">
      <section className="account-page">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <AccountNav route={route} onNavigate={onNavigate} />
        {children}
      </section>
    </main>
  );
}

function ProfilePanel({ user }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(profileForm());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch("/api/profile")
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Profile could not be loaded");
        if (!active) return;
        setProfile(data);
        setForm(profileForm(data));
      })
      .catch((error) => active && setStatus(error.message))
      .catch(() => null);
    return () => { active = false; };
  }, []);

  function changeField(event) {
    const name = event.target.name;
    const value = ["first_name", "middle_name", "last_name"].includes(name) ? capitalizeNamePart(event.target.value) : event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updatePhone(index, field, value) {
    setForm((current) => ({ ...current, phones: current.phones.map((phone, phoneIndex) => phoneIndex === index ? { ...phone, [field]: value } : phone) }));
  }

  function addPhone() {
    setForm((current) => ({ ...current, phones: [...current.phones, { id: `phone-${Date.now()}`, label: "", country_code: "+91", phone_number: "", is_primary: current.phones.length === 0 }] }));
  }

  function removePhone(index) {
    setForm((current) => {
      const phones = current.phones.filter((_, phoneIndex) => phoneIndex !== index);
      if (phones.length && !phones.some((phone) => phone.is_primary)) phones[0] = { ...phones[0], is_primary: true };
      return { ...current, phones };
    });
  }

  function makePrimary(index) {
    setForm((current) => ({ ...current, phones: current.phones.map((phone, phoneIndex) => ({ ...phone, is_primary: phoneIndex === index })) }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      if (profile?.dob && profile.dob !== form.dob && !window.confirm("Your birthday can only be changed once a year. Continue with this change?")) return;
      const normalized = {
        ...form,
        first_name: capitalizeNamePart(form.first_name),
        middle_name: capitalizeNamePart(form.middle_name),
        last_name: capitalizeNamePart(form.last_name),
      };
      const response = await apiFetch("/api/profile", { method: "PUT", body: JSON.stringify(normalized) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Profile could not be saved");
      setProfile(data);
      setForm(profileForm(data));
      setEditing(false);
      setStatus("Profile saved to your account.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  const firstName = capitalizeNamePart(profile?.first_name || user?.name?.split(" ")[0] || "Member");
  const displayName = [profile?.first_name, profile?.middle_name, profile?.last_name].filter(Boolean).map(capitalizeNamePart).join(" ") || capitalizeNamePart(user?.name || "Member");
  const age = calculateAge(form.dob || profile?.dob);
  const birthdayLocked = Boolean(profile?.dob && !profile?.can_change_dob);
  return (
    <section className="account-panel profile-panel" aria-labelledby="profile-details-title">
      <div className="profile-overview">
        <div className="profile-identity">
          <div className="profile-avatar-large" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</div>
          <div><p className="eyebrow">Personal details</p><h2 id="profile-details-title">{displayName}</h2><p className="muted">{user?.email}</p></div>
        </div>
        <span className="account-badge">{user?.role === "admin" ? "Admin" : "Member"}</span>
      </div>
      <div className="profile-facts" aria-label="Profile summary">
        <div><span>Phone</span><strong>{profile?.phone || "Not added"}</strong></div>
        <div><span>Birthday</span><strong>{profile?.dob ? formatIST(profile.dob, { dateStyle: "medium" }) : "Not added"}{age !== null && ` · ${age} years`}</strong></div>
        <div><span>Gender / sex</span><strong>{profileGenderLabel(profile?.gender)}</strong></div>
      </div>
      {status && <p className="inline-note" role="status">{status}</p>}
      <button className="primary-action profile-edit-trigger" type="button" aria-expanded={editing} onClick={() => { setEditing((value) => !value); setStatus(""); }}>{editing ? "Close editor" : "Edit profile"} <span aria-hidden="true">{editing ? "×" : "↗"}</span></button>
      {editing && <form className="account-form profile-edit-panel" onSubmit={save}>
        <div className="profile-edit-heading"><div><p className="eyebrow">Edit profile</p><h3>Keep your details current.</h3></div><p className="muted">Your name is shown with an uppercase first letter.</p></div>
        <div className="form-row"><label>First name<input name="first_name" value={form.first_name} onChange={changeField} required autoComplete="given-name" /></label><label>Middle name <span className="form-hint">optional</span><input name="middle_name" value={form.middle_name} onChange={changeField} autoComplete="additional-name" /></label></div>
        <div className="form-row"><label>Last name<input name="last_name" value={form.last_name} onChange={changeField} required autoComplete="family-name" /></label><div className="profile-phone-list"><div className="profile-phone-heading"><span>Mobile numbers</span><span className="form-hint">up to 5 numbers</span></div>{form.phones.map((phone, index) => <div className="profile-phone-row" key={phone.id || index}><PhoneField id={`profile-phone-${index}`} label={index === 0 ? "" : `Mobile number ${index + 1}`} countryCode={phone.country_code} number={phone.phone_number} onCountryCodeChange={(value) => updatePhone(index, "country_code", value)} onNumberChange={(value) => updatePhone(index, "phone_number", value)} /><label className="phone-label-input">Label <span className="form-hint">optional</span><input value={phone.label} onChange={(event) => updatePhone(index, "label", event.target.value)} placeholder="Personal, work…" /></label><label className="phone-primary-choice"><input type="radio" name="primary-phone" checked={phone.is_primary} onChange={() => makePrimary(index)} /> Primary</label>{form.phones.length > 1 && <button type="button" className="text-link" onClick={() => removePhone(index)}>Remove</button>}</div>)}<button type="button" className="secondary-action" onClick={addPhone} disabled={form.phones.length >= 5}>+ Add another number</button></div></div>
        <div className="form-row"><label>Gender / sex<select name="gender" value={form.gender} onChange={changeField}><option value="">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Birthday <span className="form-hint">changeable once per year</span><input name="dob" type="date" value={form.dob} onChange={changeField} disabled={birthdayLocked} autoComplete="bday" />{age !== null && <span className="profile-age-note">Calculated age: {age}</span>}</label></div>
        {birthdayLocked && <p className="inline-note">Birthday changes are locked until {formatIST(profile.dob_change_available_at, { dateStyle: "medium" })}.</p>}
        <button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"} <span aria-hidden="true">↗</span></button>
      </form>}
    </section>
  );
}

export function ProfileCompletionPage({ user, onComplete }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(profileForm({}, true));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch("/api/profile")
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Profile could not be loaded");
        if (!active) return;
        setProfile(data);
        setForm(profileForm(data, true));
      })
      .catch((error) => active && setStatus(error.message))
      .catch(() => null);
    return () => { active = false; };
  }, []);

  function changeField(event) {
    const name = event.target.name;
    const value = ["first_name", "middle_name", "last_name"].includes(name) ? capitalizeNamePart(event.target.value) : event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updatePhone(field, value) {
    setForm((current) => ({ ...current, phones: current.phones.map((phone, index) => index === 0 ? { ...phone, [field]: value } : phone) }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const normalized = {
        ...form,
        first_name: capitalizeNamePart(form.first_name),
        middle_name: capitalizeNamePart(form.middle_name),
        last_name: capitalizeNamePart(form.last_name),
      };
      const response = await apiFetch("/api/profile", { method: "PUT", body: JSON.stringify(normalized) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Profile could not be saved");
      setProfile(data);
      setForm(profileForm(data, true));
      onComplete(data);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  const age = calculateAge(form.dob);
  const birthdayLocked = Boolean(profile?.dob && !profile?.can_change_dob);
  return (
    <main className="page-main">
      <section className="account-page profile-completion-page">
        <p className="eyebrow">One last step</p>
        <h1 className="page-title">Complete your profile.</h1>
        <p className="profile-completion-intro">Welcome to Glamia, {user?.name || "member"}. Add these details before you continue so your account, orders, and reviews use the right information.</p>
        <section className="account-panel profile-completion-panel" aria-labelledby="profile-completion-title">
          <div className="profile-edit-heading"><div><p className="eyebrow">Required account details</p><h2 id="profile-completion-title">Tell us about you.</h2></div><p className="muted">Your name is shown with an uppercase first letter.</p></div>
          <form className="account-form" onSubmit={save}>
            <div className="form-row"><label>First name<input name="first_name" value={form.first_name} onChange={changeField} required autoComplete="given-name" /></label><label>Middle name <span className="form-hint">optional</span><input name="middle_name" value={form.middle_name} onChange={changeField} autoComplete="additional-name" /></label></div>
            <div className="form-row"><label>Last name<input name="last_name" value={form.last_name} onChange={changeField} required autoComplete="family-name" /></label><div className="profile-phone-list"><div className="profile-phone-heading"><span>Mobile number</span><span className="form-hint">required</span></div>{form.phones.slice(0, 1).map((phone) => <div className="profile-phone-row profile-phone-row-required" key={phone.id}><PhoneField id="onboarding-phone" label="" countryCode={phone.country_code} number={phone.phone_number} onCountryCodeChange={(value) => updatePhone("country_code", value)} onNumberChange={(value) => updatePhone("phone_number", value)} required /></div>)}</div></div>
            <div className="form-row"><label>Gender / sex<select name="gender" value={form.gender} onChange={changeField} required><option value="">Choose an option</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Birthday<input name="dob" type="date" value={form.dob} onChange={changeField} disabled={birthdayLocked} required autoComplete="bday" />{age !== null && <span className="profile-age-note">Calculated age: {age}</span>}</label></div>
            {birthdayLocked && <p className="inline-note">Birthday changes are locked until {formatIST(profile.dob_change_available_at, { dateStyle: "medium" })}.</p>}
            {status && <p className="inline-error" role="alert">{status}</p>}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving details…" : "Save and continue"} <span aria-hidden="true">↗</span></button>
          </form>
        </section>
      </section>
    </main>
  );
}

function AddressPanel({ initialAddresses }) {
  const [addresses, setAddresses] = useState(initialAddresses || []);
  const [form, setForm] = useState({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAddresses(initialAddresses || []); }, [initialAddresses]);

  async function reload() {
    const response = await apiFetch("/api/addresses");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Addresses could not be loaded");
    setAddresses(data.addresses || []);
  }

  function changeField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await apiFetch("/api/addresses", { method: "POST", body: JSON.stringify({ ...form, isDefault: addresses.length === 0 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Address could not be saved");
      setAddresses(data.addresses || []);
      setForm({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India" });
      setStatus("Address saved to your account.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(address) {
    try {
      const response = await apiFetch(`/api/addresses/${encodeURIComponent(address.id)}`, { method: "PATCH", body: JSON.stringify({ ...address, isDefault: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Default address could not be updated");
      setAddresses(data.addresses || []);
      setStatus("Default address updated.");
    } catch (error) { setStatus(error.message); }
  }

  async function remove(address) {
    if (!window.confirm(`Delete the address for ${address.name}? This cannot be undone.`)) return;
    try {
      const response = await apiFetch(`/api/addresses/${encodeURIComponent(address.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Address could not be deleted");
      await reload();
      setStatus("Address deleted.");
    } catch (error) { setStatus(error.message); }
  }

  return (
    <div className="account-columns">
      <section className="account-panel" aria-labelledby="saved-addresses-title">
        <div className="account-panel-heading"><div><p className="eyebrow">Saved for checkout</p><h2 id="saved-addresses-title">Your addresses</h2></div><span className="account-badge">{addresses.length}/20</span></div>
        {addresses.length ? <div className="saved-address-list">{addresses.map((address) => <article className={`saved-address-card ${address.isDefault ? "is-default" : ""}`} key={address.id}><div><strong>{address.name}</strong>{address.isDefault && <span className="default-tag">Default</span>}<p>{address.phone}<br />{addressLine(address)}</p></div><div className="address-actions">{!address.isDefault && <button type="button" onClick={() => setDefault(address)}>Set default</button>}<button type="button" onClick={() => remove(address)}>Delete</button></div></article>)}</div> : <div className="empty-state">No saved addresses yet. Add one and it will be ready at checkout.</div>}
        {status && <p className="inline-note" role="status">{status}</p>}
      </section>
      <section className="account-panel" aria-labelledby="new-address-title">
        <p className="eyebrow">Address book</p><h2 id="new-address-title">Add an address</h2>
        <form className="account-form" onSubmit={save}>
          <div className="form-row"><label>Full name<input name="name" value={form.name} onChange={changeField} required /></label><PhoneField label="Phone" countryCode={splitPhone(form.phone).countryCode} number={splitPhone(form.phone).number} onCountryCodeChange={(value) => setForm((current) => ({ ...current, phone: composePhone(value, splitPhone(current.phone).number) }))} onNumberChange={(value) => setForm((current) => ({ ...current, phone: composePhone(splitPhone(current.phone).countryCode, value) }))} required /></div>
          <label>Address line<input name="line1" value={form.line1} onChange={changeField} required /></label><label>Apartment, landmark <span className="form-hint">optional</span><input name="line2" value={form.line2} onChange={changeField} /></label>
          <div className="form-row"><label>City / town<input name="city" value={form.city} onChange={changeField} required /></label><label>State / region<input name="state" value={form.state} onChange={changeField} /></label></div>
          <div className="form-row"><label>Postal code<input name="pin" value={form.pin} onChange={changeField} /></label><label>Country<input name="country" value={form.country} onChange={changeField} required /></label></div>
          <button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save address"} <span aria-hidden="true">↗</span></button>
        </form>
      </section>
    </div>
  );
}

function OrdersPanel({ initialOrders, products }) {
  const [orders, setOrders] = useState(initialOrders || []);
  const [returns, setReturns] = useState([]);
  const [status, setStatus] = useState("");
  const [afterSalesOrder, setAfterSalesOrder] = useState(null);
  useEffect(() => { setOrders(initialOrders || []); }, [initialOrders]);
  useEffect(() => {
    let active = true;
    apiFetch("/api/returns").then(async (response) => {
      const data = await response.json();
      if (active && response.ok) setReturns(data.requests || []);
    }).catch(() => null);
    return () => { active = false; };
  }, []);

  async function refreshReturns() {
    const response = await apiFetch("/api/returns").catch(() => null);
    if (response?.ok) {
      const data = await response.json();
      setReturns(data.requests || []);
    }
  }

  async function cancel(order) {
    if (!window.confirm(`Cancel order ${order.order_number}?`)) return;
    const response = await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/cancel`, { method: "POST", body: "{}" });
    const data = await response.json();
    if (!response.ok) { setStatus(data.error || "Order could not be cancelled"); return; }
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: "cancelled" } : item));
    setStatus("Order cancelled.");
  }

  return (
    <section className="account-panel" aria-labelledby="orders-title">
      <div className="account-panel-heading"><div><p className="eyebrow">Order history</p><h2 id="orders-title">Your purchases</h2></div><span className="account-badge">{orders.length} total</span></div>
      {status && <p className="inline-note" role="status">{status}</p>}
      {orders.length ? <div className="order-list">{orders.map((order) => {
        const afterSales = returns.find((request) => request.order_id === order.id);
        return <article className="account-order-card" key={order.id}><div className="order-card-top"><div><strong>{order.order_number}</strong><p>{order.created_at ? formatIST(order.created_at) : "Recent order"} · {order.order_type === "preorder" ? "Pre-order" : String(order.payment_method || "demo").toUpperCase()} · Payment {String(order.payment_status || "demo").replace(/_/g, " ")}</p></div><span className={`status-pill status-${order.status}`}>{String(order.status || "pending").replace(/_/g, " ")}</span></div><div className="order-items">{(order.items || []).map((item, index) => <span key={`${order.id}-${index}`}>{item.name || item.title || item.product_name || item.id}{item.size ? ` · ${item.size}` : ""} × {item.quantity}{item.preorder && <small className="preorder-line-label">Pre-order</small>}</span>)}</div>{afterSales && <p className="inline-note" role="status">After-sales request: {String(afterSales.status || "requested").replace(/_/g, " ")}{afterSales.refund_destination === "store_credit" ? " · Store credit" : ""}</p>}<div className="order-card-bottom"><strong>{money(order.total)}</strong><div className="order-card-actions"><a className="text-link" href={`/api/orders/${encodeURIComponent(order.id)}/invoice`} target="_blank" rel="noreferrer">Invoice preview ↗</a>{order.status === "delivered" && !afterSales && <button type="button" onClick={() => setAfterSalesOrder(order)}>Return / Refund</button>}{["pending", "confirmed"].includes(order.status) && cancellationWindowOpen(order) && <button type="button" onClick={() => cancel(order)}>Cancel order</button>}{["pending", "confirmed"].includes(order.status) && !cancellationWindowOpen(order) && <small className="form-hint">Cancellation window closed after 2 days.</small>}</div></div></article>;
      })}</div> : <div className="empty-state">You have not placed an order yet.</div>}
      {afterSalesOrder && <AfterSalesDialog order={afterSalesOrder} products={products} onClose={() => setAfterSalesOrder(null)} onComplete={(data) => { setAfterSalesOrder(null); refreshReturns(); setStatus(data.replacement_order ? "Exchange submitted and a replacement order was created." : "Return / refund request submitted."); }} />}
    </section>
  );
}

function WishlistPanel({ products, wishlist, toggleWishlist, onNavigate }) {
  const saved = useMemo(() => products.filter((product) => wishlist.has(product.id)), [products, wishlist]);
  return (
    <section className="account-panel" aria-labelledby="wishlist-title">
      <div className="account-panel-heading"><div><p className="eyebrow">Saved edits</p><h2 id="wishlist-title">Your wishlist</h2></div><span className="account-badge">{saved.length} saved</span></div>
      {saved.length ? <div className="product-grid account-product-grid">{saved.map((product) => <article className="product-card" key={product.id}><button className="product-image" type="button" onClick={() => onNavigate(productUrl(product))}>{product.image_url && <img src={product.image_url} alt={product.name} loading="lazy" />}<span className="quick-view">View item ↗</span></button><button className="wishlist-button is-saved" type="button" onClick={() => toggleWishlist(product.id)} aria-label={`Remove ${product.name} from wishlist`}>♥</button><div className="product-info"><p>{product.brand || product.category}</p><h3>{product.name}</h3><strong>{money(product.price)}</strong></div></article>)}</div> : <div className="empty-state">Nothing saved yet. Tap the heart on an item to keep it here.</div>}
    </section>
  );
}

export function AccountPage({ route, user, addresses, orders, products, wishlist, toggleWishlist, onNavigate }) {
  if (!user) {
    return <AccountLayout route={route} onNavigate={onNavigate} title="Sign in to continue"><section className="account-panel"><p className="muted">Sign in to access your profile, saved addresses, orders, and wishlist.</p><button className="primary-action" type="button" onClick={() => onNavigate("/login")}>Continue to sign in <span aria-hidden="true">↗</span></button></section></AccountLayout>;
  }

  const title = route === "/address" ? "Address book" : route === "/orders" ? "Your orders" : route === "/wishlist" ? "Wishlist" : route === "/reviews" ? "Your reviews" : "Your account";
  return <AccountLayout route={route} onNavigate={onNavigate} title={title}>{route === "/profile" && <ProfilePanel user={user} />}{route === "/address" && <AddressPanel initialAddresses={addresses} />}{route === "/orders" && <OrdersPanel initialOrders={orders} products={products} />}{route === "/wishlist" && <WishlistPanel products={products} wishlist={wishlist} toggleWishlist={toggleWishlist} onNavigate={onNavigate} />}{route === "/reviews" && <MyReviewsPanel onNavigate={onNavigate} />}</AccountLayout>;
}
