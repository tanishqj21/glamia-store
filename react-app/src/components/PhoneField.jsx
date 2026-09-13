import React from "react";

export const PHONE_COUNTRIES = [
  ["+91", "India"], ["+1", "United States / Canada"], ["+44", "United Kingdom"],
  ["+61", "Australia"], ["+971", "United Arab Emirates"], ["+65", "Singapore"],
  ["+880", "Bangladesh"], ["+977", "Nepal"], ["+49", "Germany"], ["+33", "France"],
  ["+39", "Italy"], ["+81", "Japan"], ["+86", "China"], ["+27", "South Africa"],
  ["+7", "Russia / Kazakhstan"], ["+55", "Brazil"], ["+34", "Spain"], ["+31", "Netherlands"],
];

export function PhoneField({ countryCode = "+91", number = "", onCountryCodeChange, onNumberChange, required = false, id, label = "Mobile number", className = "" }) {
  return <div className={`phone-field ${className}`.trim()}>
    <label htmlFor={id ? `${id}-number` : undefined}>{label}
      <span className="phone-input-row">
        <select aria-label="Country calling code" value={countryCode} onChange={(event) => onCountryCodeChange(event.target.value)}>
          {PHONE_COUNTRIES.map(([code, country]) => <option value={code} key={code}>{code} · {country}</option>)}
        </select>
        <input id={id ? `${id}-number` : undefined} type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(event) => onNumberChange(event.target.value)} required={required} placeholder="Mobile number" />
      </span>
    </label>
  </div>;
}

export function splitPhone(value) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/[\s().-]/g, "");
  const matchedCode = [...PHONE_COUNTRIES].sort((left, right) => right[0].length - left[0].length).find(([code]) => compact.startsWith(code) && compact.slice(code.length).length >= 4);
  if (matchedCode) return { countryCode: matchedCode[0], number: compact.slice(matchedCode[0].length) };
  const match = raw.match(/^(\+\d{1,4})[\s.-]*(.*)$/);
  if (!match) return { countryCode: "+91", number: raw };
  const knownCode = PHONE_COUNTRIES.find(([code]) => code === match[1]);
  return { countryCode: knownCode ? match[1] : "+91", number: knownCode ? match[2].trim() : raw };
}

export function composePhone(countryCode, number) {
  return `${countryCode || "+91"} ${String(number || "").trim()}`.trim();
}
