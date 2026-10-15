/**
 * Files waiting for the Files & links page (SE-FILE-006). Files dropped on
 * any page, or several chosen at once, line up here; the page takes them one
 * at a time. A module-level list, so a drop that switches to the page before
 * it has mounted is not lost.
 */

/** What the decoder reads (commands/files.rs MEDIA_EXTENSIONS). */
export const MEDIA_EXTENSIONS = [
  "mp3",
  "m4a",
  "mp4",
  "mov",
  "m4v",
  "wav",
  "flac",
  "ogg",
  "aac",
  "mkv",
  "webm",
  "opus",
  "oga",
];

export const isMediaPath = (path: string) =>
  MEDIA_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

let waiting: string[] = [];
const listeners = new Set<() => void>();

/** Adds paths to the end of the line, skipping ones already waiting. */
export const queueFiles = (paths: string[]) => {
  const fresh = paths.filter((path) => !waiting.includes(path));
  if (fresh.length === 0) return;
  waiting = [...waiting, ...fresh];
  listeners.forEach((listener) => listener());
};

/** Takes the next path, or null when none is waiting. */
export const takeNextFile = (): string | null => {
  const [next, ...rest] = waiting;
  if (next === undefined) return null;
  waiting = rest;
  listeners.forEach((listener) => listener());
  return next;
};

export const clearFileQueue = () => {
  waiting = [];
  listeners.forEach((listener) => listener());
};

export const waitingFiles = () => waiting.length;

export const onFileQueueChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
