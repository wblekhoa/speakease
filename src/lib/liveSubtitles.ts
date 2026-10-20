/**
 * Live subtitles (beta): what the subtitle bar shows, from the events the
 * session sends (src-tauri/src/live_subtitles.rs `pipeline::Event`). The
 * panel reads like a chat: each line is its own bubble with its translation,
 * newest at the bottom, and the session so far can be scrolled back (owner,
 * 20/10: one line was replaced before it could be read). The line being
 * heard sits at the bottom until its translation arrives. A re-joined
 * sentence takes the place of the pieces it covers.
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
  /** undefined: not translated yet. */
  target?: string;
  /** No translation will come (Translate was off, or the AI failed): the
   * line shows as heard for good. */
  heardOnly?: boolean;
}

/** One line on the bar: what was heard and its translation, if any yet. */
export interface SubtitleItem {
  index: number;
  source: string;
  target: string | null;
  /** No translation will come; show what was heard. */
  heardOnly: boolean;
  /** Still being heard (its text may change). */
  final: boolean;
}

export interface SubtitleView {
  appName: string | null;
  listening: boolean;
  error: string | null;
  /** Oldest first; the last is the newest. */
  items: SubtitleItem[];
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

/** How far back the panel can be scrolled (History keeps the whole session). */
export const KEEP_LINES = 60;

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
      if (!line) return state;
      lines.set(
        event.index,
        event.target === null
          ? { ...line, heardOnly: true }
          : { ...line, target: event.target, heardOnly: false },
      );
      break;
    }
    case "rejoin": {
      if (event.target === null) return state;
      // The first piece becomes the whole sentence; the others leave.
      const [first, ...rest] = event.indexes;
      const line = lines.get(first);
      if (!line) return state;
      lines.set(first, {
        source: event.source,
        final: true,
        target: event.target,
      });
      rest.forEach((index) => lines.delete(index));
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
  const indexes = [...state.lines.keys()].sort((a, b) => a - b);
  const items = indexes.map((index) => {
    const line = state.lines.get(index)!;
    return {
      index,
      source: line.source,
      target: line.target ?? null,
      heardOnly: line.heardOnly ?? false,
      final: line.final,
    };
  });
  return {
    appName: state.appName,
    listening: state.listening,
    error: state.error,
    items,
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
