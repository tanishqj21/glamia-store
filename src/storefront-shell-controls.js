// Keep server-rendered buttons from accepting clicks before React installs
// their handlers. Native anchors remain usable. The client removes only these
// temporary locks immediately before hydration; real disabled controls remain.
export function pendingShoppingControls(html) {
  return html.replace(/<button([^>]*)>/g, (tag, attributes) =>
    /\sdisabled(?:\s|=|$)/.test(attributes) ? tag : `<button disabled="" data-glamia-pending-control=""${attributes}>`);
}
