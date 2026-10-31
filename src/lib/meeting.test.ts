import assert from "node:assert/strict";
import {
  elapsed,
  exportMeeting,
  meetingErrorKey,
  meetingFileName,
  notesView,
  shownNotes,
  copyText,
} from "./meeting";

// The timer counts from the start, and shows hours only past an hour.
assert.equal(elapsed(1000, 1000_000), "0:00");
assert.equal(elapsed(1000, 1065_000), "1:05");
assert.equal(elapsed(1000, 1000_000 + 3_725_000), "1:02:05");
// A clock a little behind the start never shows a negative time.
assert.equal(elapsed(1000, 999_000), "0:00");

// Errors are named by the code before ":"; anything else is "other".
assert.equal(meetingErrorKey("no-app: no meeting app is running"), "no-app");
assert.equal(meetingErrorKey("microphone: device busy"), "microphone");
assert.equal(meetingErrorKey("Tap failed with status -1"), "other");

console.log("meeting.test.ts: ok");

// SE-MEET-018: the notes area follows the stored state.
assert.deepEqual(notesView("writing", false), { kind: "writing" });
assert.deepEqual(notesView("done", true), { kind: "notes" });
assert.deepEqual(notesView("done", false), { kind: "failed" });
assert.deepEqual(notesView("empty", true), { kind: "empty" });
assert.deepEqual(notesView("no_ai:ai_off", false), {
  kind: "noAi",
  reason: "ai_off",
});
assert.deepEqual(notesView("no_ai:nothing_available", false), {
  kind: "noAi",
  reason: "nothing_available",
});

// SE-MEET-015: a file holds the notes, then the transcript; .txt has no "#".
const meeting = {
  title: "Zoom · 31/10 09:30",
  notes:
    "## Quyết định\n- Ra mắt 15/11\n\n## Việc cần làm\n- [ ] gửi bài — Minh",
  transcript: "[Tôi] chào mọi người",
};
assert.equal(
  exportMeeting(meeting, "md", "Bản ghi lời"),
  "# Zoom · 31/10 09:30\n\n## Quyết định\n- Ra mắt 15/11\n\n## Việc cần làm\n- [ ] gửi bài — Minh\n\n## Bản ghi lời\n\n[Tôi] chào mọi người\n",
);
assert.equal(
  exportMeeting(meeting, "txt", "Bản ghi lời"),
  "Zoom · 31/10 09:30\n\nQuyết định\n- Ra mắt 15/11\n\nViệc cần làm\n- [ ] gửi bài — Minh\n\nBản ghi lời\n\n[Tôi] chào mọi người\n",
);
// With no notes (no AI), the file is the transcript.
assert.equal(
  exportMeeting({ ...meeting, notes: null }, "txt", "Transcript"),
  "Zoom · 31/10 09:30\n\nTranscript\n\n[Tôi] chào mọi người\n",
);
assert.equal(meetingFileName(meeting.title, "md"), "Zoom · 31-10 09-30.md");

// SE-MEET-010: a template switch keeps the old notes on screen while writing.
assert.equal(shownNotes({ kind: "writing" }, "## Old"), "## Old");
assert.equal(shownNotes({ kind: "writing" }, null), null);
assert.equal(shownNotes({ kind: "failed" }, "## Old"), null);
assert.equal(shownNotes({ kind: "noAi", reason: "ai_off" }, "## Old"), null);
// SE-MEET-015: Copy takes the tab in view; with no notes, the transcript.
assert.equal(copyText("notes", "## N", "T"), "## N");
assert.equal(copyText("transcript", "## N", "T"), "T");
assert.equal(copyText("notes", null, "T"), "T");

console.log("meeting.test.ts (page): ok");
