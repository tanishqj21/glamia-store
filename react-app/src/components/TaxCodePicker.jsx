import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const STOP_WORDS = new Set([
  "a", "an", "and", "for", "from", "in", "of", "on", "the", "to",
  "all", "new", "men", "women", "unisex", "product", "collection"
]);

function tokens(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]{2,}/g) || [])]
    .filter((token) => !STOP_WORDS.has(token));
}

function suggestionScore(row, searchTokens, contextTokens, search) {
  const code = String(row.code || "").toLowerCase();
  const description = String(row.description || "").toLowerCase();
  let score = 0;
  if (search) {
    if (code === search) score += 500;
    else if (code.startsWith(search)) score += 300;
    else if (code.includes(search)) score += 180;
    if (description.includes(search)) score += 140;
  }
  searchTokens.forEach((token) => {
    if (code.includes(token)) score += 90;
    if (description.includes(token)) score += 70;
  });
  contextTokens.forEach((token) => {
    if (description.includes(token)) score += 24;
  });
  // Prefer a usable subheading/code over a two-digit chapter when scores tie.
  if (String(row.code || "").length >= 4) score += 8;
  return score;
}

export function taxRuleFor(code, price, mrp) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  if (/^(61|62)/.test(normalized)) {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) return { rate: null, reason: "Add a selling price to calculate the apparel default." };
    return value <= 1000
      ? { rate: 5, reason: "Apparel sale value is ₹1,000 or less per piece." }
      : { rate: 12, reason: "Apparel sale value is above ₹1,000 per piece." };
  }
  if (/^64/.test(normalized)) {
    const value = Number(mrp || price);
    if (!Number.isFinite(value) || value <= 0) return { rate: null, reason: "Add an MRP to calculate the footwear default." };
    return value <= 500
      ? { rate: 5, reason: "Footwear MRP is ₹500 or less per pair." }
      : { rate: 18, reason: "Footwear MRP is above ₹500 per pair." };
  }
  if (/^4202/.test(normalized)) return { rate: 18, reason: "The supplied fashion rate notes list bags, wallets, and cases at 18%." };
  return null;
}

export function TaxCodePicker({
  code = "",
  type = "HSN",
  rate = "",
  taxInclusive = true,
  price = "",
  mrp = "",
  context = "",
  onChange,
}) {
  const [masters, setMasters] = useState({ HSN: [], SAC: [] });
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState(code || "");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/data/tax/hsn.json", { cacheTtl: 86400000 }).then((response) => response.ok ? response.json() : []),
      apiFetch("/data/tax/sac.json", { cacheTtl: 86400000 }).then((response) => response.ok ? response.json() : [])
    ]).then(([hsn, sac]) => {
      if (active) {
        setMasters({ HSN: Array.isArray(hsn) ? hsn : [], SAC: Array.isArray(sac) ? sac : [] });
        setLoaded(true);
      }
    }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  const suggestions = useMemo(() => {
    const source = masters[type] || [];
    const search = String(query || "").trim().toLowerCase();
    const searchTokens = tokens(search);
    const contextTokens = tokens(context);
    if (!source.length || (!search && !contextTokens.length)) return [];
    return source
      .map((row, index) => ({ row, index, score: suggestionScore(row, searchTokens, contextTokens, search) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || String(left.row.code).localeCompare(String(right.row.code)))
      .slice(0, 8)
      .map(({ row }) => row);
  }, [context, masters, query, type]);

  const selected = (masters[type] || []).find((row) => String(row.code) === String(code).trim());
  const autoRule = taxRuleFor(code, price, mrp);
  function changeCode(nextCode) {
    const next = { hsn_sac_code: nextCode };
    const rule = taxRuleFor(nextCode, price, mrp);
    if (rule?.rate !== null && rule?.rate !== undefined) next.gst_rate = rule.rate;
    onChange?.(next);
  }
  function choose(row) {
    const nextCode = String(row.code || "").toUpperCase();
    const rule = taxRuleFor(nextCode, price, mrp);
    setQuery(nextCode);
    onChange?.({ hsn_sac_code: nextCode, hsn_sac_type: type, ...(rule?.rate !== null && rule?.rate !== undefined ? { gst_rate: rule.rate } : {}) });
  }

  return <fieldset className="tax-code-picker">
    <legend>HSN / SAC code <span>optional until your tax mapping is confirmed</span></legend>
    <p className="form-hint">Suggestions use the listing details and the supplied HSN/SAC master. Confirm the final classification with your tax adviser.</p>
    <div className="tax-code-picker-grid">
      <label>Code type<select value={type} onChange={(event) => { setQuery(""); onChange?.({ hsn_sac_type: event.target.value, hsn_sac_code: "", gst_rate: "" }); }}><option value="HSN">HSN · goods</option><option value="SAC">SAC · services</option></select></label>
      <label>HSN / SAC code<input value={code} onChange={(event) => { const value = event.target.value.toUpperCase(); setQuery(value); changeCode(value); }} placeholder={type === "SAC" ? "Search SAC code or wording" : "Search HSN code or wording"} maxLength="20" /></label>
      <label>GST rate (%)<input type="number" min="0" max="100" step="0.01" value={rate} onChange={(event) => onChange?.({ gst_rate: event.target.value })} placeholder="Set after confirmation" /></label>
      <label className="tax-code-checkbox"><input type="checkbox" checked={taxInclusive} onChange={(event) => onChange?.({ gst_tax_inclusive: event.target.checked })} /> Price includes GST</label>
    </div>
    {loaded && suggestions.length > 0 && <div className="tax-code-suggestions" aria-label="Smart tax code suggestions"><span>Suggested matches</span>{suggestions.map((row) => <button type="button" key={`${type}-${row.code}`} onClick={() => choose(row)}><strong>{row.code}</strong><small>{row.description}</small></button>)}</div>}
    {loaded && !suggestions.length && (query || context) && <p className="form-hint">No master match yet. Try a more specific product name or search by code.</p>}
    {selected && <p className="tax-code-selected"><strong>{selected.code}</strong><span>{selected.description}</span></p>}
    {autoRule?.rate !== null && autoRule?.rate !== undefined && <p className="tax-code-auto-note"><strong>Defaulted to {autoRule.rate}%</strong><span>{autoRule.reason} You can adjust this rate above.</span></p>}
    {code && !autoRule && <p className="form-hint">No supplied default rate covers this code. Enter the confirmed rate above.</p>}
    {autoRule?.rate === null && <p className="form-hint">{autoRule.reason}</p>}
    {!loaded && <p className="form-hint">Loading tax-code suggestions…</p>}
  </fieldset>;
}
