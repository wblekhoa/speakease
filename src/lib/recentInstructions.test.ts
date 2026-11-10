import assert from "node:assert/strict";
import {
  forgetInstruction,
  MAX_RECENT_INSTRUCTIONS,
  parseInstructions,
  rememberInstruction,
} from "./recentInstructions";

// SE-AI-013: newest first, no duplicates (case and end spaces ignored), at most five.
assert.deepEqual(rememberInstruction([], "  thay rì-ác bằng React "), [
  "thay rì-ác bằng React",
]);
assert.deepEqual(rememberInstruction(["a", "B", "c"], "b"), ["b", "a", "c"]);
assert.deepEqual(rememberInstruction(["a"], "   "), ["a"]);
const full = ["1", "2", "3", "4", "5"];
assert.equal(rememberInstruction(full, "6").length, MAX_RECENT_INSTRUCTIONS);
assert.deepEqual(rememberInstruction(full, "6"), ["6", "1", "2", "3", "4"]);

// Removing one keeps the order of the rest.
assert.deepEqual(forgetInstruction(["a", "b", "c"], "b"), ["a", "c"]);

// Stored values that are not a list of words read as empty.
assert.deepEqual(parseInstructions(null), []);
assert.deepEqual(parseInstructions("not json"), []);
assert.deepEqual(parseInstructions('{"a":1}'), []);
assert.deepEqual(parseInstructions('["x", 3, " ", "y"]'), ["x", "y"]);
// A hand-edited store with copies keeps the first of each.
assert.deepEqual(parseInstructions('["a", " A ", "b", "a"]'), ["a", "b"]);

console.log("recentInstructions: ok");
