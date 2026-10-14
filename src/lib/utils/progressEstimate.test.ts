import assert from "node:assert/strict";
import { estimateProgress, formatElapsed } from "./progressEstimate";

// SE-FILE-005
const start = 0;
// Before any part is done the bar still moves, using the fallback pace.
const early = estimateProgress(
  { done: 0, total: 15, startedAt: start, stepAt: start },
  4_000,
  8,
);
assert.ok(early.fraction > 0 && early.fraction < 1 / 15);
assert.equal(early.secondsLeft, null);

// Four parts in 40 s: 10 s a part. Mid-way through the fifth part the bar is
// past the 4/15 mark, short of 5/15, and keeps creeping.
const sample = { done: 4, total: 15, startedAt: start, stepAt: 40_000 };
const a = estimateProgress(sample, 45_000, 8);
const b = estimateProgress(sample, 50_000, 8);
const c = estimateProgress(sample, 400_000, 8);
assert.ok(a.fraction > 4 / 15 && a.fraction < 5 / 15);
assert.ok(b.fraction > a.fraction, "moves on while the part runs");
assert.ok(c.fraction < 5 / 15, "never claims the part before it is done");
// About 10.6 parts of 10 s left after 5 s into the fifth.
assert.ok(a.secondsLeft !== null && a.secondsLeft > 90 && a.secondsLeft < 115);

// Done is done.
assert.deepEqual(
  estimateProgress({ done: 15, total: 15, startedAt: 0, stepAt: 1 }, 2, 8),
  { fraction: 1, secondsLeft: 0 },
);

assert.equal(formatElapsed(42.7), "0:42");
assert.equal(formatElapsed(725), "12:05");

console.log("progressEstimate: ok");
