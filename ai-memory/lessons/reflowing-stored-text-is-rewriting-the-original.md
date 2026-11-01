---
type: lesson
category: error
scope: speakease
tags: [area/storage, area/data-import, stack/rust, files, meetings]
summary: "Reformatting stored text (even only line breaks) rewrites the user's original; derive the shape where it is read, or keep the original untouched."
status: active
superseded_by:
last_verified: 2026-11-01
---

# Reflowing a stored transcript is rewriting the original

## Trigger

01/11: to let meeting Q&A cite lines of a file transcript (Files writes one paragraph), commit `80a96cf` saved the
History text one sentence a line. Reviews found it breaks "the original text is kept" (`logic/files.md` Fixed), splits
abbreviations ("TP. HCM", "v.v."), drops paragraph breaks and never splits Chinese or Japanese.

## Root cause

"Only whitespace changes" felt harmless, but the stored text is the user's original and other features (Rewrite,
Translate, History search, copy) read it as is; the splitter was written for AI pieces, not for display.

## Fix

`e290e04`: the reflow was removed; `commands/files.rs` is identical to `main` again. A file meeting's transcript is
one paragraph and Q&A cites it whole (recorded in `decisions.md` and the owner's list).

## Guardrail

Never change stored user text to suit one reader. If a reader needs another shape (lines to cite), derive it at read
time in one shared function, or store the derived form beside the original, and test it on abbreviations, decimals
("3.5") and a language without spaces.
