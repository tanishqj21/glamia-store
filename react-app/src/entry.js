import './styles.css';
import './fonts.css';
import './wibrawl.css';
import './wibrawl-overhaul.css';
import './wibrawl-commerce.css';
import './wibrawl-arena.css';
import './footer.css';

function loadStorefrontStyles() {
  return Promise.all([...document.querySelectorAll('link[data-glamia-storefront-css]')].map(preload => new Promise((resolve, reject) => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = preload.href;
    // The first-screen CSS is already inline. Download remaining rules without
    // making the browser hold that first paint for a pending stylesheet.
    stylesheet.media = 'print';
    if (preload.getAttribute('fetchpriority') === 'low') stylesheet.fetchPriority = 'low';
    stylesheet.addEventListener('load', () => {
      stylesheet.media = 'all';
      resolve();
    }, { once: true });
    stylesheet.addEventListener('error', () => reject(new Error('The storefront stylesheet could not load.')), { once: true });
    document.head.appendChild(stylesheet);
  })));
}

async function startApplication() {
  try {
    const [application] = await Promise.all([import('./main.jsx'), loadStorefrontStyles()]);
    await application.mountApplication();
  }
  catch (error) {
    console.error('storefront_application_load_failed', error);
    document.getElementById('initial-loader')?.remove();
    const notice = document.createElement('section');
    notice.className = 'inline-note';
    notice.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = 'We could not load the shopping controls. Reload the page to try again.';
    const retry = document.createElement('button');
    retry.className = 'secondary-action';
    retry.type = 'button';
    retry.textContent = 'Reload page';
    retry.addEventListener('click', () => window.location.reload());
    notice.append(message, retry);
    document.getElementById('root').prepend(notice);
  }
}

// Yield one task so the public HTML can paint, without waiting on animation
// frames that can stall in background/throttled rendering. Other routes start
// immediately. All visitors follow the same code path;
// analytics, account, cart and checkout features remain in the application.
if (document.querySelector('#glamia-storefront-bootstrap, #glamia-product-bootstrap, #glamia-catalogue-bootstrap, #glamia-cart-bootstrap') && document.getElementById('root').hasChildNodes()) {
  window.setTimeout(startApplication, 0);
} else startApplication();
