import { cloneElement, useId } from 'react';

export function WibrawlHint({ label, children, id: stableId }) {
  const generatedId = useId(), id = stableId || generatedId;
  return <span className="wb-hint">{cloneElement(children,{'aria-describedby':id})}<span className="wb-hint-badge" role="tooltip" id={id}>{label}</span></span>;
}
