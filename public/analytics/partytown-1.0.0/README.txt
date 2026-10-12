Partytown 1.0.0, copied unmodified from @qwik.dev/partytown/lib.
MIT license: LICENSE.txt. Source: https://github.com/QwikDev/partytown
The versioned service-worker scope is limited to this directory; it does not control shopping routes.
The main page retains its strict script CSP. The sandbox document is served by Partytown's own scoped service worker.
The adjacent ga-queue.js restores Google tag command shapes inside the worker. Application events and native fallbacks are verified by scripts/analytics-worker-browser-test.mjs.
