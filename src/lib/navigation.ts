/**
 * Opening a section of the settings window from inside a page (the Speak
 * page's "More settings" links) or from the tray (lib.rs "open_history"
 * emits the same name as a Tauri event). App.tsx listens to both.
 */
export const NAVIGATE_EVENT = "navigate-to-section";

export const openSection = (section: string) => {
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: section }));
};
