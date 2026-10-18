import { useEffect, useRef } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const idle = () => {};

function visibleBounds(element) {
  if (!element?.getBoundingClientRect) return null;
  const box = element.getBoundingClientRect();
  const left = Math.max(0, box.left), top = Math.max(0, box.top);
  const right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

function sourceImage(scope) {
  const images = scope?.tagName === 'IMG' ? [scope] : [...scope?.querySelectorAll('img') || []].reverse();
  return images.filter(image => image.complete && image.naturalWidth && getComputedStyle(image).opacity > .15)
    .map(image => ({ image, box: visibleBounds(image) }))
    .filter(item => item.box)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
}

// Decorative motion only: the existing cart controller owns every cart update.
// One flight at a time bounds DOM/GPU work during rapid additions.
export function useWibrawlCartMotion(enabled, route) {
  const cleanup = useRef(idle);
  useEffect(() => {
    if (!enabled) return;
    const cancel = () => cleanup.current();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', cancel);
    media.addEventListener('change', cancel);
    return () => {
      cancel();
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', cancel);
      media.removeEventListener('change', cancel);
    };
  }, [enabled, route]);

  return (product, origin = {}) => {
    if (!enabled || document.hidden) return;
    cleanup.current();
    const cart = document.querySelector('.wb-command-bar .cart-link');
    if (!cart) return;
    let host, timer;
    const animations = [];
    const dispose = () => {
      clearTimeout(timer);
      animations.forEach(animation => animation.cancel());
      cart.classList.remove('wb-cart-confirmed');
      host?.remove();
      if (cleanup.current === dispose) cleanup.current = idle;
    };
    cleanup.current = dispose;
    // Keep the cart's normal count/status feedback without spatial motion.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !cart.animate) {
      cart.classList.add('wb-cart-confirmed');
      timer = setTimeout(dispose, 400);
      return;
    }
    try {
      const trigger = origin?.trigger || document.activeElement;
      const scope = origin?.source || trigger?.closest('.wb-spec-card,.wb-product-spec-page,.quick-view-dialog,.wb-film-card,.product-card');
      const media = sourceImage(scope), box = media?.box || visibleBounds(trigger);
      const src = media?.image.currentSrc || media?.image.src || product.image_url || product.thumbnail_url;
      const destination = visibleBounds(cart);
      if (!src || !box || !destination) { dispose(); return; }
      const ratio = media ? media.image.getBoundingClientRect().height / media.image.getBoundingClientRect().width : 4 / 3;
      let width = Math.min(300, innerWidth * .56, media?.box.width || 180), height = width * ratio;
      if (height > innerHeight * .44) { width *= innerHeight * .44 / height; height = innerHeight * .44; }
      const sourceX = clamp(box.left + box.width / 2 - width / 2, 8, innerWidth - width - 8);
      const sourceY = clamp(box.top + box.height / 2 - height / 2, 8, innerHeight - height - 8);
      const centerX = clamp((sourceX + width / 2) * .3 + innerWidth * .35 - width / 2, 18, innerWidth - width - 30);
      const centerY = clamp(innerHeight * .43 - height / 2, 80, innerHeight - height - 80);
      const endX = destination.left + destination.width / 2 - width / 2;
      const endY = destination.top + destination.height / 2 - height / 2;
      host = document.createElement('div');
      host.className = 'wb-cart-flight';
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('popover', 'manual');
      document.body.append(host);
      // A non-modal top layer keeps the trail visible above quick-view dialogs
      // without trapping focus, intercepting input or moving their DOM.
      if (host.showPopover) host.showPopover();
      const wash = document.createElement('div');
      wash.className = 'wb-cart-flight-wash';
      host.append(wash);
      animations.push(wash.animate([{ opacity: 0 }, { opacity: 1, offset: .35 }, { opacity: .7, offset: .65 }, { opacity: 0 }], { duration: 1140, fill: 'both' }));
      for (let i = 0; i < 7; i++) {
        const piece = document.createElement('div'), image = document.createElement('img');
        piece.className = 'wb-cart-flight-piece';
        piece.style.width = `${width}px`; piece.style.height = `${height}px`;
        if (i < 6) piece.style.clipPath = `inset(${(i % 3) * 7}% 0 ${((i + 1) % 3) * 8}% 0)`;
        image.src = src; image.alt = ''; image.draggable = false;
        image.style.objectFit = media ? getComputedStyle(media.image).objectFit : 'cover';
        image.style.transform = `scale(${1 + (6 - i) * .035})`;
        piece.append(image); host.append(piece);
        const step = innerWidth < 768 ? 7 : 12;
        const spread = `translate3d(${centerX + (i - 3) * step}px,${centerY + (i - 3) * step}px,0) rotate(${(i - 3) * 2}deg) scale(.94)`;
        const end = `translate3d(${endX}px,${endY}px,0) rotate(0deg) scale(.035)`;
        animations.push(piece.animate([
          { transform: `translate3d(${sourceX}px,${sourceY}px,0) scale(.98)`, opacity: 0 },
          { opacity: 1, offset: .12 },
          { transform: spread, opacity: 1, offset: .45 },
          { transform: spread, opacity: 1, offset: .62, easing: 'cubic-bezier(.4,0,.2,1)' },
          { transform: end, opacity: .65, offset: .94 },
          { transform: end, opacity: 0 },
        ], { duration: 880, delay: i * 26, easing: 'linear', fill: 'both' }));
      }
      animations.push(cart.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: .45 }, { transform: 'scale(1)' }], { delay: 820, duration: 300 }));
      timer = setTimeout(dispose, 1180);
    } catch {
      // Visual support must never interrupt adding an item to the bag.
      dispose();
    }
  };
}
