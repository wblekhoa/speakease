---
type: lesson
category: error
scope: speakease
tags: [area/ai, area/data-import, stack/tauri, surface/macos, files, meetings]
summary: "Before a new feature runs AI automatically on another feature's output, read that feature's live rules; Files says no AI step runs on its own."
status: active
superseded_by:
last_verified: 2026-11-01
---

# A new automatic trigger broke the sibling feature's "no AI on its own" rule

## Trigger

01/11, meeting notes for recordings from Files: the first cut (commit `80a96cf`) made every file transcribed on
Files & links a meeting and wrote AI notes for it with no press. All gates passed (374 tests, clippy, lint, doc
index). The fresh Spec review found that SE-FILE-002 (live) says "No AI step runs on its own" and `logic/files.md`
"Fixed" says "no AI step runs without being asked".

## Root cause

The spec decided the template for a file, not when a file becomes a meeting. The open fork was filled from the
meeting side alone ("a call gets notes after Stop, so a file should too") without reading the rules of the feature
whose output was being reused. No gate checks behaviour against another feature's REQ rows.

## Fix

`e290e04`: the automatic path was dropped; Files shows **Ghi chú cuộc họp** on the result card and only a press
writes notes (`meeting::session::note_file`). SE-FILE-002 names the button. Landed as wblekhoa/speakease#8.

## Guardrail

When a feature starts work on another feature's output (an entry, a file, a transcript), read that feature's
`docs/product/logic/<feature>.md` rows and its "Fixed" list before building, and quote the rule in the decisions
entry. Anything that sends text to AI or costs time runs on the user's press unless a live row says otherwise.
