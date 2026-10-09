// Dev-only browser preview: a stand-in Tauri backend when there is none.
// It has to be in place before any module that talks to the backend is
// evaluated, so the app itself is loaded after it.
const backend = import.meta.env.DEV
  ? import("./dev/mockTauri")
  : Promise.resolve();
backend.then(() => import("./boot"));

export {};
