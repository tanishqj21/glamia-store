// Accessible, non-blocking failures in the current console; no browser alerts.
export function reportAdminError(error) {
  window.dispatchEvent(new CustomEvent('glamia-admin-error', {
    detail: { message: error?.message || 'The change could not be saved. Please try again.' }
  }));
}
