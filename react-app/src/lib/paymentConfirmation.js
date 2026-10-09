// Sequential, bounded reads only. Never creates a payment or retries a charge.
export function startPaymentConfirmation({ check, onExhausted, document, window,
  now = Date.now, schedule = setTimeout, cancel = clearTimeout, maxAttempts = 20, maxDuration = 120000 }) {
  const controller = new AbortController();
  const started = now();
  let timer, attempts = 0, running = false, stopped = false;
  const available = () => document.visibilityState !== "hidden" && window.navigator.onLine !== false;
  const stop = () => {
    stopped = true;
    cancel(timer);
    controller.abort();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
  };
  const exhausted = () => { stop(); onExhausted?.(); };
  async function run() {
    if (stopped || running || !available()) return;
    cancel(timer);
    if (attempts >= maxAttempts || now() - started >= maxDuration) { exhausted(); return; }
    running = true;
    let result;
    try { result = await check(controller.signal); }
    catch { result = "retry"; }
    running = false;
    if (stopped) return;
    if (result === "terminal" || result === "stop") { stop(); return; }
    if (result !== "skipped") attempts += 1;
    if (attempts >= maxAttempts || now() - started >= maxDuration) { exhausted(); return; }
    timer = schedule(run, result === "skipped" ? 500 : attempts < 4 ? 3000 : attempts < 10 ? 5000 : 10000);
  }
  function resume() { if (available()) void run(); }
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  void run();
  return stop;
}
