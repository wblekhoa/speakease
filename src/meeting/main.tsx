// Dev-only browser preview: a stand-in Tauri backend when there is none
// (see src/main.tsx). The meeting bar is loaded after it.
const backend = import.meta.env.DEV
  ? import("../dev/mockTauri")
  : Promise.resolve();
backend.then(() => import("./boot"));

export {};
