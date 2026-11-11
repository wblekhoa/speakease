// SpeakEase meeting notes (beta): what the meeting bar shows, kept apart
// from React so it can be tested (meeting.test.ts).

import type { MeetingSource, MeetingSources } from "@/bindings";

/** Error codes the backend puts before ":" (meeting.rs). */
const KNOWN_ERRORS = [
  "unsupported",
  "no-app",
  "running",
  "microphone",
  "no-model",
  "vad",
] as const;

export type MeetingErrorKey = (typeof KNOWN_ERRORS)[number] | "other";

/** The translation key for a meeting error from the backend. */
export const meetingErrorKey = (error: string): MeetingErrorKey => {
  const code = error.split(":")[0].trim();
  return (KNOWN_ERRORS as readonly string[]).includes(code)
    ? (code as MeetingErrorKey)
    : "other";
};

/** "m:ss", or "h:mm:ss" past an hour, since `startedAt` (unix seconds). */
export const elapsed = (startedAt: number, nowMs: number) => {
  const total = Math.max(0, Math.floor(nowMs / 1000 - startedAt));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

// SpeakEase Meetings page (SE-MEET-018).

/** A meeting's length as the timer shows it. */
export const duration = (ms: number) => elapsed(0, ms);

/** What the notes area shows for a meeting's stored `notes_state`. */
export type NotesView =
  | { kind: "writing" }
  | { kind: "notes" }
  | { kind: "empty" }
  | { kind: "failed" }
  | { kind: "noAi"; reason: "ai_off" | "nothing_available" };

export const notesView = (state: string, hasNotes: boolean): NotesView => {
  if (state === "writing") return { kind: "writing" };
  if (state === "empty") return { kind: "empty" };
  if (state === "failed") return { kind: "failed" };
  if (state.startsWith("no_ai:")) {
    return {
      kind: "noAi",
      reason: state.endsWith(":ai_off") ? "ai_off" : "nothing_available",
    };
  }
  return hasNotes ? { kind: "notes" } : { kind: "failed" };
};

/** The notes on screen, if any: kept while a template switch writes new
 *  ones (SE-MEET-010). */
export const shownNotes = (
  view: NotesView,
  notes: string | null,
): string | null =>
  view.kind === "notes" || view.kind === "empty" || view.kind === "writing"
    ? notes
    : null;

// SE-MEET-015
/** What Copy takes: the notes on the Notes tab when there are any, else the
 *  transcript. */
export const copyText = (
  tab: "notes" | "transcript",
  notes: string | null,
  transcript: string,
): string => (tab === "notes" && notes ? notes : transcript);

/** The four note templates (meeting_notes.rs NoteKind), in menu order. */
export const NOTE_KINDS = ["meeting", "call", "lecture", "interview"] as const;

// SE-MEET-015
/** A meeting as a file: the notes (when there are any), then the transcript.
 *  `txt` drops the Markdown heading marks and keeps the checkboxes. */
export const exportMeeting = (
  meeting: { title: string; notes: string | null; transcript: string },
  format: "md" | "txt",
  transcriptHeading: string,
) => {
  const parts = [`# ${meeting.title}`];
  if (meeting.notes) parts.push(meeting.notes.trim());
  parts.push(`## ${transcriptHeading}`, meeting.transcript.trim());
  const text = parts.join("\n\n") + "\n";
  return format === "md" ? text : text.replace(/^#{1,6} /gm, "");
};

/** A file name from a meeting's title ("Zoom · 31/10 09:30"), safe on macOS. */
export const meetingFileName = (title: string, format: "md" | "txt") =>
  `${title.replace(/[/:\\]/g, "-").trim() || "meeting"}.${format}`;

// SE-MEET-014
/** The i18n key for an ask_meeting error ("no_ai:<reason>", else a failure). */
export const askError = (error: string): string => {
  // The same "no_ai:<reason>" the notes' state carries (notesView).
  const view = notesView(error, false);
  return view.kind === "noAi"
    ? `meeting.page.ask.noAi.${view.reason}`
    : "meeting.page.ask.failed";
};

/** Line `n` (1-based) of a transcript, trimmed; "" past its end. */
export const transcriptLine = (transcript: string, n: number): string =>
  (transcript.split("\n")[n - 1] ?? "").trim();

// SE-MEET-021
/** Where the sound comes from: what `commands.startMeeting` takes. */
export type SourceChoice = MeetingSource;
export const AUTOMATIC: SourceChoice = { kind: "automatic" };

export const sameSource = (a: SourceChoice, b: SourceChoice): boolean =>
  a.kind === b.kind &&
  (a.kind !== "app" || (b.kind === "app" && a.value === b.value));

/** The app a start on `source` would record, by name; null for the
 *  microphone only. A named app that is no longer listed keeps the name it
 *  was picked under (`pickedName`): the start reports it gone. While the bar
 *  asks about a call (`asked`, that app's name), Automatic records that app
 *  (meeting.rs `source_when_asked`). */
export const plannedApp = (
  source: SourceChoice,
  sources: MeetingSources,
  pickedName: string | null = null,
  asked: string | null = null,
): string | null => {
  if (source.kind === "automatic")
    return asked ?? sources.automatic?.name ?? null;
  if (source.kind === "microphone") return null;
  return (
    sources.apps.find((a) => a.bundle_id === source.value)?.name ?? pickedName
  );
};

/** The muted line under the button: its i18n key and the app it names. The
 *  "will record" forms while idle, the "recording" forms during a meeting
 *  (`app` is then the name the backend reports, null for the microphone). */
export const recordLine = (
  recording: boolean,
  app: string | null,
): { key: string; app?: string } => {
  const base = recording ? "meeting.start.recording" : "meeting.start.will";
  return app === null ? { key: `${base}Mic` } : { key: `${base}App`, app };
};

/** What the start control does for a meeting phase: "idle" starts, "recording"
 *  stops, transcribing and writing notes wait. "asking" starts too: a Start
 *  while the bar asks about a call answers it (meeting.rs `session::start`). */
export const controlMode = (phase: string): "idle" | "recording" | "busy" =>
  phase === "recording"
    ? "recording"
    : phase === "transcribing" || phase === "notes"
      ? "busy"
      : "idle";

/** One row of the source menu. */
export type SourceItem = {
  id: string;
  source: SourceChoice;
  kind: "automatic" | "microphone" | "app";
  /** The app's name, for an app row. */
  name?: string;
  /** For Automatic: the app it would record now, null for the microphone. */
  hint?: string | null;
  ticked: boolean;
};

/** The menu: Automatic (with what it would record now: the app the bar asks
 *  about, `asked`, when there is one), the microphone only, then each
 *  running app. The chosen one is ticked, unless it is an app that has gone
 *  (no row to tick; the start then resets the choice). */
export const sourceItems = (
  chosen: SourceChoice,
  sources: MeetingSources,
  asked: string | null = null,
): SourceItem[] => [
  {
    id: "automatic",
    source: AUTOMATIC,
    kind: "automatic",
    hint: asked ?? sources.automatic?.name ?? null,
    ticked: sameSource(chosen, AUTOMATIC),
  },
  {
    id: "microphone",
    source: { kind: "microphone" },
    kind: "microphone",
    ticked: sameSource(chosen, { kind: "microphone" }),
  },
  ...sources.apps.map((a): SourceItem => {
    const source: SourceChoice = { kind: "app", value: a.bundle_id };
    return {
      id: a.bundle_id,
      source,
      kind: "app",
      name: a.name,
      ticked: sameSource(chosen, source),
    };
  }),
];

/** A named app that has gone: show the error, then choose Automatic again. */
export const fallsBackToAutomatic = (error: string): boolean =>
  meetingErrorKey(error) === "no-app";
