import assert from "node:assert/strict";
import {
  SIDEBAR_FOLD_AT,
  SIDEBAR_FOLDED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  sidebarDrag,
} from "./sidebarWidth";

// Inside the range the column follows the cursor exactly.
assert.deepEqual(sidebarDrag(250), { folded: false, shown: 250, settled: 250 });

// Past the halfway mark between the rail and MIN, it folds.
assert.equal(SIDEBAR_FOLD_AT, 128);
assert.deepEqual(sidebarDrag(127), {
  folded: true,
  shown: SIDEBAR_FOLDED_WIDTH,
  settled: SIDEBAR_FOLDED_WIDTH,
});
assert.equal(sidebarDrag(-40).folded, true);

// Between the mark and MIN: a rubber band, settling at MIN.
const band = sidebarDrag(150);
assert.equal(band.folded, false);
assert.equal(band.shown, 170);
assert.equal(band.settled, SIDEBAR_MIN_WIDTH);
assert.equal(sidebarDrag(SIDEBAR_FOLD_AT).folded, false);

// Past MAX: the same band the other way, settling at MAX.
assert.deepEqual(sidebarDrag(380), {
  folded: false,
  shown: 340,
  settled: SIDEBAR_MAX_WIDTH,
});

// Nothing usable folds rather than throwing a NaN into the layout.
assert.equal(sidebarDrag(Number.NaN).folded, true);

console.log("sidebarWidth: ok");
