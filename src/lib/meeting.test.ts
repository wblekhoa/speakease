import assert from "node:assert/strict";
import { elapsed, meetingErrorKey } from "./meeting";

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
