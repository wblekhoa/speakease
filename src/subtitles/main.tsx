// Dev-only browser preview: a stand-in Tauri backend when there is none
// (see src/main.tsx). The subtitle bar is loaded after it.
// In the browser preview there is no native blur behind the panel: draw a
// stand-in box (LiveSubtitles.css .ls-preview) so the preview matches.
if (!("__TAURI_INTERNALS__" in window)) {
  document.documentElement.classList.add("ls-preview");
}
const backend = import.meta.env.DEV
  ? import("../dev/mockTauri")
  : Promise.resolve();
backend.then(() => import("./boot"));

export {};
