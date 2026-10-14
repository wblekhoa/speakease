/** The short error codes commands/files.rs returns ("unsupported: …" may
 * carry a detail after the colon), as `files.errors.*` keys. */
const KNOWN = [
  "busy",
  "cancelled",
  "unsupported",
  "no audio",
  "no speech",
  "bad link",
  "download failed",
  "needs yt-dlp",
  "no model",
  "ai off",
  "ai failed",
];

export const fileErrorKey = (error: string) => {
  const code = error.split(":")[0].trim();
  return KNOWN.includes(code) ? code.replace(/[ -]/g, "_") : "other";
};
