import assert from "node:assert/strict";
import {
  clearFileQueue,
  isMediaPath,
  onFileQueueChange,
  queueFiles,
  takeNextFile,
  waitingFiles,
} from "./fileQueue";

// SE-FILE-006
assert.ok(isMediaPath("/Users/you/Movies/Phỏng vấn.MOV"));
assert.ok(isMediaPath("a.m4a"));
assert.ok(!isMediaPath("notes.txt"));
assert.ok(!isMediaPath("video.webm"));

let changes = 0;
const stop = onFileQueueChange(() => changes++);
queueFiles(["/a.mp4", "/b.mp3"]);
queueFiles(["/b.mp3", "/c.wav"]); // already waiting: skipped
assert.equal(waitingFiles(), 3);
assert.equal(takeNextFile(), "/a.mp4");
assert.equal(takeNextFile(), "/b.mp3");
assert.equal(waitingFiles(), 1);
clearFileQueue();
assert.equal(takeNextFile(), null);
assert.ok(changes >= 4);
stop();

console.log("fileQueue: ok");
