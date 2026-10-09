import { useId, useState } from 'react';
import { PHONE_COUNTRIES } from '../lib/phoneCountries';
export { PHONE_COUNTRIES, splitPhone, composePhone } from '../lib/phoneCountries';

export function PhoneField({ countryCode = "+91", number = "", onCountryCodeChange, onNumberChange, required = false, id, label = "Mobile number", className = "" }) {
  const generatedId = useId();
  const numberId = `${id || generatedId}-number`;
  const [selectedRegion, setSelectedRegion] = useState(countryCode);
  // Separate option identity from the stored dialling prefix: Canada and the
  // US (and other shared plans) stay individually selectable without changing
  // the existing phone-data contract or adding country IDs to saved numbers.
  const selected = PHONE_COUNTRIES.find(country => country.value === selectedRegion && country.code === countryCode)
    || PHONE_COUNTRIES.find(country => country.value === countryCode);
  return <div className={`phone-field ${className}`.trim()}>
    <label htmlFor={numberId}>{label}</label>
      <div className="phone-input-row">
        <select aria-label="Country calling code" title={selected?.name} value={selected?.value || countryCode} onChange={(event) => {
          const country = PHONE_COUNTRIES.find(entry => entry.value === event.target.value);
          if (!country) return;
          setSelectedRegion(country.value);
          onCountryCodeChange(country.code);
        }}>
          {!selected && <option value={countryCode}>{countryCode} · International</option>}
          {PHONE_COUNTRIES.map(country => <option value={country.value} key={country.region}>{country.code} · {country.label}</option>)}
        </select>
        <input id={numberId} aria-label={label || "Mobile number"} type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(event) => onNumberChange(event.target.value)} required={required} placeholder="Mobile number" />
      </div>
  </div>;
}
