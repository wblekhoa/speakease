/**
 * Live subtitles (beta): what the subtitle bar shows, from the events the
 * session sends (src-tauri/src/live_subtitles.rs `pipeline::Event`). The
 * source line follows the speech as it is heard; the translation line keeps
 * the latest translation, so it never goes blank while the next line is
 * being translated. A re-joined sentence replaces the pieces it covers.
 */

export type SubtitleEvent =
  | { kind: "context"; app_name: string; playing: string | null }
  | { kind: "warm_up"; ok: boolean; error: string | null }
  | { kind: "tapping"; model: string }
  | { kind: "partial"; index: number; source: string }
  | { kind: "line"; index: number; source: string }
  | { kind: "translation"; index: number; target: string | null }
  | {
      kind: "rejoin";
      indexes: number[];
      source: string;
      target: string | null;
    }
  | { kind: "topic"; topic: string | null }
  | { kind: "error"; error: string }
  | { kind: "ended" };

interface Line {
  source: string;
  final: boolean;
  /** undefined: not translated yet; "": covered by a re-joined sentence. */
  target?: string;
}

export interface SubtitleView {
  appName: string | null;
  listening: boolean;
  error: string | null;
  source: string;
  target: string;
  /** When the last line or translation arrived (ms since epoch). */
  updatedAt: number;
}

export interface SubtitleState {
  appName: string | null;
  listening: boolean;
  error: string | null;
  lines: Map<number, Line>;
  updatedAt: number;
}

export const emptySubtitles = (): SubtitleState => ({
  appName: null,
  listening: false,
  error: null,
  lines: new Map(),
  updatedAt: 0,
});

/** Lines older than the last few are dropped: the bar shows one pair. */
const KEEP_LINES = 8;

export const applySubtitleEvent = (
  state: SubtitleState,
  event: SubtitleEvent,
  now: number,
): SubtitleState => {
  const lines = new Map(state.lines);
  const next = { ...state, lines };
  switch (event.kind) {
    case "context":
      next.appName = event.app_name || null;
      return next;
    case "tapping":
      next.listening = true;
      next.error = null;
      return next;
    case "error":
      next.error = event.error;
      return next;
    case "ended":
      next.listening = false;
      return next;
    case "partial": {
      const line = lines.get(event.index);
      if (line?.final) return state;
      lines.set(event.index, { source: event.source, final: false });
      break;
    }
    case "line":
      if (!event.source) {
        lines.delete(event.index);
        return next;
      }
      lines.set(event.index, {
        ...lines.get(event.index),
        source: event.source,
        final: true,
      });
      break;
    case "translation": {
      const line = lines.get(event.index);
      if (!line || event.target === null) return state;
      lines.set(event.index, { ...line, target: event.target });
      break;
    }
    case "rejoin": {
      if (event.target === null) return state;
      event.indexes.forEach((index, n) => {
        const line = lines.get(index);
        if (line) {
          lines.set(index, {
            ...line,
            target: n === 0 ? event.target! : "",
          });
        }
      });
      break;
    }
    default:
      return state;
  }
  const indexes = [...lines.keys()].sort((a, b) => a - b);
  for (const old of indexes.slice(
    0,
    Math.max(0, indexes.length - KEEP_LINES),
  )) {
    lines.delete(old);
  }
  next.updatedAt = now;
  return next;
};

export const subtitleView = (state: SubtitleState): SubtitleView => {
  const indexes = [...state.lines.keys()].sort((a, b) => b - a);
  const latest = indexes.length ? state.lines.get(indexes[0]) : undefined;
  let target = "";
  for (const index of indexes) {
    const line = state.lines.get(index);
    if (line?.target) {
      target = line.target;
      break;
    }
  }
  return {
    appName: state.appName,
    listening: state.listening,
    error: state.error,
    source: latest?.source ?? "",
    target,
    updatedAt: state.updatedAt,
  };
};

/** The code before ":" in a session error ("no-process: …" → "no-process"). */
export const subtitleErrorKey = (error: string) => {
  const code = error.split(":")[0].trim();
  const known = [
    "unsupported",
    "no-model",
    "no-process",
    "tap",
    "vad",
    "running",
  ];
  return known.includes(code) ? code : "other";
};
