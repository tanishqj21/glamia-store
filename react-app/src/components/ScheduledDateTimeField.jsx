import { useId } from 'react';

export function ScheduledDateTimeField({ label, className = '', ...inputProps }) {
  const id = useId();
  return <div className={`schedule-datetime-field ${className}`} role="group" aria-labelledby={`${id}-label`}>
    <label id={`${id}-label`} htmlFor={id} className="schedule-datetime-label">{label}</label>
    <input {...inputProps} id={id} type="datetime-local" step="1" />
  </div>;
}
