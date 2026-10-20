import assert from "node:assert/strict";
import {
  applySubtitleEvent,
  emptySubtitles,
  KEEP_LINES,
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
// Each line keeps its translation; earlier lines stay above the newest.
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
assert.deepEqual(view.items, [
  {
    index: 1,
    source: "Hello there.",
    target: "Xin chào.",
    heardOnly: false,
    final: true,
  },
  {
    index: 2,
    source: "And then",
    target: null,
    heardOnly: false,
    final: false,
  },
]);

// A line that gets no translation (Translate off, or the AI failed) shows
// as heard for good, not as "translating" dots.
view = subtitleView(
  run([
    { kind: "line", index: 1, source: "Off the record." },
    { kind: "translation", index: 1, target: null },
  ]),
);
assert.equal(view.items[0].heardOnly, true);
assert.equal(view.items[0].target, null);

// The panel keeps the last KEEP_LINES lines to scroll back through.
let rolled = emptySubtitles();
for (let i = 1; i <= KEEP_LINES + 5; i++) {
  rolled = applySubtitleEvent(
    rolled,
    { kind: "line", index: i, source: `l${i}` },
    i,
  );
}
const kept = subtitleView(rolled).items.map((item) => item.index);
assert.equal(kept.length, KEEP_LINES);
assert.equal(kept[0], 6);

// A late partial never overwrites the final line.
view = subtitleView(
  run([
    { kind: "line", index: 2, source: "And then we left." },
    { kind: "partial", index: 2, source: "And then" },
  ]),
);
assert.equal(view.items[0].source, "And then we left.");

// A re-joined sentence takes the place of its pieces.
view = subtitleView(
  run([
    { kind: "line", index: 1, source: "Vietnam was their target, and" },
    { kind: "translation", index: 1, target: "mảnh 1" },
    { kind: "line", index: 2, source: "they lost it." },
    { kind: "translation", index: 2, target: "mảnh 2" },
    {
      kind: "rejoin",
      indexes: [1, 2],
      source: "Vietnam was their target, and they lost it.",
      target: "cả câu",
    },
  ]),
);
assert.deepEqual(view.items, [
  {
    index: 1,
    source: "Vietnam was their target, and they lost it.",
    target: "cả câu",
    heardOnly: false,
    final: true,
  },
]);

// An empty recognition is dropped; old lines are forgotten.
let state = run([{ kind: "line", index: 1, source: "" }]);
assert.equal(state.lines.size, 0);
for (let i = 1; i <= 100; i++) {
  state = applySubtitleEvent(
    state,
    { kind: "line", index: i, source: `l${i}` },
    i,
  );
}
assert.equal(state.lines.size, KEEP_LINES);

assert.equal(
  subtitleErrorKey("no-process: com.x has no audio process"),
  "no-process",
);
assert.equal(subtitleErrorKey("something odd"), "other");

console.log("liveSubtitles: ok");
