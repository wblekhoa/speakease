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
