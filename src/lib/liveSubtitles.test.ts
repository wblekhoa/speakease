import assert from "node:assert/strict";
import {
  applySubtitleEvent,
  emptySubtitles,
  subtitleErrorKey,
  subtitleView,
  type SubtitleEvent,
} from "./liveSubtitles";

const run = (events: SubtitleEvent[]) =>
  events.reduce(
    (state, event, i) => applySubtitleEvent(state, event, i),
    emptySubtitles(),
  );

// SE-LIVE-008
// The source follows the speech; the translation keeps the last one.
let view = subtitleView(
  run([
    { kind: "context", app_name: "Google Chrome", playing: null },
    { kind: "tapping", model: "m" },
    { kind: "line", index: 1, source: "Hello there." },
    { kind: "translation", index: 1, target: "Xin chào." },
    { kind: "partial", index: 2, source: "And then" },
  ]),
);
assert.equal(view.appName, "Google Chrome");
assert.ok(view.listening);
assert.equal(view.source, "And then");
assert.equal(view.target, "Xin chào.");

// A late partial never overwrites the final line.
view = subtitleView(
  run([
    { kind: "line", index: 2, source: "And then we left." },
    { kind: "partial", index: 2, source: "And then" },
  ]),
);
assert.equal(view.source, "And then we left.");

// A re-joined sentence replaces its pieces.
view = subtitleView(
  run([
    { kind: "line", index: 1, source: "Vietnam was their target, and" },
    { kind: "translation", index: 1, target: "mảnh 1" },
    { kind: "line", index: 2, source: "they lost it." },
    { kind: "translation", index: 2, target: "mảnh 2" },
    { kind: "rejoin", indexes: [1, 2], source: "…", target: "cả câu" },
  ]),
);
assert.equal(view.target, "cả câu");

// An empty recognition is dropped; old lines are forgotten.
let state = run([{ kind: "line", index: 1, source: "" }]);
assert.equal(state.lines.size, 0);
for (let i = 1; i <= 20; i++) {
  state = applySubtitleEvent(
    state,
    { kind: "line", index: i, source: `l${i}` },
    i,
  );
}
assert.equal(state.lines.size, 8);

assert.equal(
  subtitleErrorKey("no-process: com.x has no audio process"),
  "no-process",
);
assert.equal(subtitleErrorKey("something odd"), "other");

console.log("liveSubtitles: ok");
