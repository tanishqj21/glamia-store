import { useEffect, useState } from "react";

const APK_DOWNLOAD_PATH = "/downloads/glamia-shopper.apk";
const MOBILE_QUERY = "(max-width: 760px), (hover: none) and (pointer: coarse)";

export function MobileAppDownload() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const controller = new AbortController();
    let checked = false;
    function checkDownload() {
      if (!media.matches || checked) return;
      checked = true;
      fetch(APK_DOWNLOAD_PATH, { method: "HEAD", cache: "no-store", signal: controller.signal })
        .then((response) => {
          if (!controller.signal.aborted) {
            setAvailable(Boolean(response.ok && response.headers.get("content-type")?.includes("android.package-archive")));
          }
        })
        .catch(() => {});
    }
    checkDownload();
    media.addEventListener("change", checkDownload);
    return () => {
      controller.abort();
      media.removeEventListener("change", checkDownload);
    };
  }, []);

  return <section className="mobile-app-download" aria-labelledby="mobile-app-download-title">
    <div className="mobile-app-download-heading">
      <img src="/glamia/g.svg" alt="" width="42" height="42" />
      <div><p className="eyebrow">Glamia on mobile</p><h2 id="mobile-app-download-title">Your edit, on the go.</h2></div>
    </div>
    <p>Get the Glamia shopper app for Android.</p>
    {available
      ? <a className="primary-action mobile-app-download-button" href={APK_DOWNLOAD_PATH} download="Glamia-Store.apk">Download Android APK</a>
      : <button type="button" className="secondary-action mobile-app-download-button" disabled>Android app coming soon</button>}
    <p className="mobile-app-store-notice">Google Play Store and Apple App Store coming soon.</p>
  </section>;
}
