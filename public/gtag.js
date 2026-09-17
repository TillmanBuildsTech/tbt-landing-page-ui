// Google Analytics 4 (GA4) — external config file kept CSP-safe.
// Loaded with `defer` AFTER the async googletagmanager loader in BaseLayout head.
// The dataLayer queue pattern means config calls made before the loader finishes
// are buffered and replayed, so ordering here is safe.
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-9QFDKZM93L');