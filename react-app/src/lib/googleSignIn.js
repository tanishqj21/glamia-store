let pending;

// The identity SDK is needed only while the visitor is signing in.
export function loadGoogleSignIn() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => {
      script.remove();
      pending = undefined;
      reject(new Error('Google sign-in is unavailable right now.'));
    }, { once: true });
    document.head.appendChild(script);
  });
  return pending;
}
