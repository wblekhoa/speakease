import assert from "node:assert/strict";
import {
  elapsed,
  exportMeeting,
  meetingErrorKey,
  meetingFileName,
  notesView,
  shownNotes,
  copyText,
  askError,
  transcriptLine,
  AUTOMATIC,
  controlMode,
  fallsBackToAutomatic,
  plannedApp,
  recordLine,
  sameSource,
  sourceItems,
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

// SE-MEET-014: a cited line is quoted as stored; errors name why.
const said = "[Tôi] một\n\n[Người khác]  ba ";
assert.equal(transcriptLine(said, 1), "[Tôi] một");
assert.equal(transcriptLine(said, 3), "[Người khác]  ba");
assert.equal(transcriptLine(said, 9), "");
assert.equal(askError("no_ai:ai_off"), "meeting.page.ask.noAi.ai_off");
assert.equal(
  askError("no_ai:nothing_available"),
  "meeting.page.ask.noAi.nothing_available",
);
assert.equal(askError("missing: gone"), "meeting.page.ask.failed");
assert.equal(askError(""), "meeting.page.ask.failed");

console.log("meeting.test.ts (page): ok");

// SE-MEET-021: the Start control.
{
  const zoom = { bundle_id: "us.zoom.xos", name: "zoom.us", playing: true };
  const chrome = {
    bundle_id: "com.google.Chrome",
    name: "Chrome",
    playing: false,
  };
  const some = { automatic: zoom, apps: [zoom, chrome] };
  const none = { automatic: null, apps: [] };

  // What a start would record.
  assert.equal(plannedApp(AUTOMATIC, some), "zoom.us");
  assert.equal(plannedApp(AUTOMATIC, none), null);
  assert.equal(plannedApp({ kind: "microphone" }, some), null);
  assert.equal(
    plannedApp({ kind: "app", value: "com.google.Chrome" }, some),
    "Chrome",
  );
  // A named app that has gone is not listed.
  assert.equal(plannedApp({ kind: "app", value: "gone" }, some), null);

  // The line under the button: four forms.
  assert.deepEqual(recordLine(false, "zoom.us"), {
    key: "meeting.start.willApp",
    app: "zoom.us",
  });
  assert.deepEqual(recordLine(false, null), { key: "meeting.start.willMic" });
  assert.deepEqual(recordLine(true, "Chrome"), {
    key: "meeting.start.recordingApp",
    app: "Chrome",
  });
  assert.deepEqual(recordLine(true, null), {
    key: "meeting.start.recordingMic",
  });

  // Idle starts, recording stops, finishing waits.
  assert.equal(controlMode("idle"), "idle");
  assert.equal(controlMode("asking"), "idle");
  assert.equal(controlMode("recording"), "recording");
  assert.equal(controlMode("transcribing"), "busy");
  assert.equal(controlMode("notes"), "busy");

  // The menu: Automatic, the microphone, then each app; one tick.
  const items = sourceItems(AUTOMATIC, some);
  assert.deepEqual(
    items.map((i) => i.id),
    ["automatic", "microphone", "us.zoom.xos", "com.google.Chrome"],
  );
  assert.deepEqual(
    items.map((i) => i.ticked),
    [true, false, false, false],
  );
  assert.equal(items[0].hint, "zoom.us");
  assert.equal(sourceItems(AUTOMATIC, none)[0].hint, null);
  assert.equal(sourceItems(AUTOMATIC, none).length, 2);
  const chosenApp = sourceItems(
    { kind: "app", value: "com.google.Chrome" },
    some,
  );
  assert.deepEqual(
    chosenApp.map((i) => i.ticked),
    [false, false, false, true],
  );
  assert.equal(sourceItems({ kind: "microphone" }, some)[1].ticked, true);
  assert.equal(
    sameSource({ kind: "app", value: "a" }, { kind: "app", value: "b" }),
    false,
  );

  // Only a missing app resets the choice.
  assert.equal(fallsBackToAutomatic("no-app: gone"), true);
  assert.equal(fallsBackToAutomatic("microphone: busy"), false);
  console.log("meeting.test.ts: start control ok");
}
