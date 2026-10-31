// SpeakEase meeting notes (beta): what the meeting bar shows, kept apart
// from React so it can be tested (meeting.test.ts).

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
