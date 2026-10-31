/* GA4 page counts, like the ReadEase site (owner, 31/10). Empty until the
   owner creates a SpeakEase web stream: with no ID nothing loads and nothing
   is sent. Also skipped on localhost and when the browser sends Do Not
   Track; Google signals and ad personalisation are off. The app itself sends
   nothing - this counts visits to the page, nothing more. */
export const GA_ID = '';

const EVENTS = [
  // [selector, event name, params from the element]
  ['[data-download]', 'download_click', el => ({ place: el.closest('.hero') ? 'hero' : 'closing' })],
  ['.nav-download', 'download_nav_click', () => ({})],
  ['.nav-github', 'github_click', () => ({})],
  ['.language', 'language_switch', el => ({ to: el.getAttribute('lang') })],
  ['summary', 'faq_open', el => ({ question: el.textContent.trim().slice(0, 80) })],
];

export function startAnalytics(id = GA_ID, win = typeof window === 'undefined' ? undefined : window) {
  if (!id || !win) return false;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(win.location.hostname) || win.navigator.doNotTrack === '1') return false;
  const doc = win.document;
  win.dataLayer = win.dataLayer || [];
  win.gtag = function gtag() { win.dataLayer.push(arguments); };
  win.gtag('js', new Date());
  win.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  doc.head.append(script);
  doc.addEventListener('click', event => {
    for (const [selector, name, params] of EVENTS) {
      const el = event.target.closest?.(selector);
      if (!el) continue;
      if (name === 'faq_open' && el.parentElement?.open) return;
      win.gtag('event', name, { ...params(el), page_language: doc.documentElement.lang });
      return;
    }
  }, { capture: true });
  return true;
}
