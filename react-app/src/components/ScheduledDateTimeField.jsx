import { useId } from 'react';

const SECONDS = Array.from({ length: 60 }, (_, second) => String(second).padStart(2, '0'));

// Browsers can omit seconds from their calendar popup even with step="1".
// Keep the complete IST wall-clock value while offering an explicit selector.
export function ScheduledDateTimeField({ label, secondsLabel, className = '', name, value = '', onChange, ...inputProps }) {
  const id = useId();
  const seconds = value.slice(17, 19) || '00';
  function changeSeconds(event) {
    if (!value) return;
    const next = value.slice(0, 16) + ':' + event.target.value;
    onChange({ target: { name, value: next, type: 'datetime-local' } });
  }
  return <div className={`schedule-datetime-field ${className}`} role="group" aria-labelledby={`${id}-label`}>
    <label id={`${id}-label`} htmlFor={id} className="schedule-datetime-label">{label}</label>
    <div className="schedule-datetime-controls">
      <input {...inputProps} id={id} name={name} type="datetime-local" step="1" value={value} onChange={onChange} />
      <label className="schedule-seconds-label"><span>Seconds</span><select aria-label={secondsLabel} value={seconds} onChange={changeSeconds} disabled={inputProps.disabled || !value}>{SECONDS.map(second => <option key={second} value={second}>{second}</option>)}</select></label>
    </div>
  </div>;
}
