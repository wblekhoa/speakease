---
status: executing
owner: Lê Khoa
started: 2026-10-31
current-phase: 2
summary: "Build meeting notes (SE-MEET-001…019) in five phases, starting with a testable notes pipeline and a hidden CLI that turns a recording or transcript into notes."
tags: [area/ai, area/audio, area/capture, stack/rust]
---

# Meeting notes build

Source of truth: `docs/product/specs/2026-10-28-meeting-notes.md` and the 28-30 Oct entries of
`docs/product/decisions.md` (both on the `speakease` branch). This plan only orders the work; it decides nothing the
spec has not.

Every phase keeps these green on its branch (the "five checks"): `bun run lint`, `bun run check:translations`,
`cargo fmt --check`, `cargo clippy`, `cargo test --lib`. A rule only seen by eye stays `not built` in
`docs/product/logic/meetings.md`.

## Phases (each with a verify command)

1. **Notes pipeline (no audio, no UI)** — SE-MEET-009, 011, 012, 019; the AI half of SE-MEET-010.
   - New module `src-tauri/src/meeting_notes.rs`: empty-recording pre-check (one named constant, 20 words after
     fillers are removed); split into parts of about 700 words at sentence ends (reusing `files::split_for_ai`);
     each part fenced; notes per part → merge → template; the template guessed from the transcript; notes in the
     language spoken; a refused part keeps its words and the job goes on (as rewriting a long file does).
   - Its own AI order, not the dictation provider setting: Apple Intelligence → a provider the user gave a key →
     Qwen3.5-4B on device → none (notes = transcript, with the reason). The AI switch off counts as none.
   - On-device: Qwen3.5-4B even when another on-device model is active (the server is started on the catalog entry
     `qwen3.5-4b`); a new chat call with a longer answer and timeout. `local_ai.rs` changes stay additive so PR
     wblekhoa/speakease#1 (`--cache-ram`) rebases cleanly.
   - Hidden CLI `--meeting-notes <transcript.txt>` (headless, like `--transcribe-file`; `--notes-kind`,
     `--notes-engine apple|key|local=<gguf>`, `--json`) so the owner's test call can run through the real pipeline
     and set the threshold. Audio first goes through `handy -f <file>`.
   - Docs: `logic/meetings.md` (all 19 rules, these live, the rest `not built`).
   - Verify: five checks; `cargo test --lib meeting_notes` (pre-check both sides of the threshold on synthetic
     Vietnamese text, splitting loses no word, fence present, every template has its sections, AI order);
     `handy --meeting-notes <synthetic.txt>` prints notes with the template's headings;
     docs-house `doc-index --check --product speakease` 0 errors.
2. **Recording** — SE-MEET-001, 003, 004, 006, 008, 013, and level 1 of SE-MEET-005.
   - Start/stop from its own shortcut, the tray and the pill menu; microphone and the meeting app's sound (process
     tap shared with live subtitles) as two tracks, "Me" and "Others"; the consent line; a timer; dictation runs in
     parallel and its words are marked in the transcript; after stop the accurate model re-runs both tracks; the
     meeting is a History entry (one migration); notes run as a background job with progress.
   - Verify: five checks; unit tests for the track merge (Me/Others ordering by time, dictation marks, last second
     kept) and the migration; a 2-minute run on the Mac with a public video playing → History entry with both labels.
3. **Meetings page** — SE-MEET-018, the switch half of SE-MEET-010, SE-MEET-015.
   - List left, notes middle, transcript tab; "AI wrote these notes, check names and numbers" with the transcript
     one click away; switch template; copy; save .md / .txt. `.docx` comes back to the owner with a library and
     its size before it is added.
   - Verify: five checks; `bun run test:unit` for the export and list logic; the page driven in the browser preview;
     `jak-hq:design-edit` review.
4. **Live help** — SE-MEET-005 levels 2-5, 007, 014, 016.
   - Floating panel under the pill: live transcript, "what did I miss?", a summary that updates, suggestion cards;
     Q&A over one meeting with line references.
   - Verify: five checks; unit tests for the rolling-window and suggestion parsing; panel in the preview;
     `jak-hq:design-edit`. Heat and battery over an hour are measured and reported, not claimed.
5. **Asking and hiding** — SE-MEET-002, 017; recordings brought in from Files use the template AI guesses.
   - Ask once per call when a meeting app holds the microphone (Meet: browser front tab); exclude the pill and panel
     from screen capture.
   - Verify: five checks; unit tests for the app list and the once-per-call rule; Zoom, Meet and Teams share tests
     recorded in `decisions.md` — until then SE-MEET-017 stays `not built`.

## Decisions

Chosen by AI under the owner's overnight delegation (31/10) - for the owner to review:

- Phases run without waiting for a go (owner, relayed 31/10: "Tự hành đến sáng cho xong hết hết").
- AI switched off in AI & Translate means no AI notes (the switch gates every AI step, as elsewhere in the app).
- "The user's API key" = the provider picked in AI & Translate when it has a key and a model, else the first other
  provider that has both.
- Meeting notes always run Qwen3.5-4B on device; another downloaded on-device model is not used instead.
- Apple Intelligence writes notes through its content-transformation guardrails (as subtitles), because the
  transcript is mostly words the user did not write and the default guardrails refused one interview part on 30/10.
- Fillers for the pre-check: alo, à, ạ, ừ, ừm, ừa, ờ, ơ, ồ, hả, dạ, vâng, ok/okay/oke, nhé, nhỉ, nha and English
  uh/um/hmm/oh/hello/hi/yeah. Words like "thì", "là", "mà" count as content.
- An empty recording without a chosen kind is labelled a call.
- Action-item bullets the AI writes in another shape are rewritten into `- [ ] action — owner`.
- Meeting notes ship behind Experimental, like live subtitles, until the owner has tried them.

- Phase order puts the testable core first; the owner's test call can run through phase 1's CLI before any UI exists.
- No new dependency in phases 1-2 and 4-5. `.docx` (phase 3) needs the owner's yes.
- One PR to `main` per phase; a phase lands on `main` (fast-forward by hash) when its PR CI is green and its
  fresh-context review found no blocker (owner, relayed 31/10).
- Phase 2: the microphone is a second stream of its own (no VAD) beside dictation's, rather than sharing dictation's
  stream; a line the microphone heard that is mostly words the app said at the same time is dropped as echo
  (dictation lines and lines under 3 words kept); with no app given, the call app playing sound is picked, then any
  call app running, then the one used last time; the mixed audio is kept as the History file; the entry is titled
  "<app> · dd/mm HH:MM"; an empty transcript is still saved, with the one-line notes; a start that fails says why
  on the meeting bar; the hidden `--meeting-probe <bundle id | pid> --probe-mute` checks tap → transcript → notes
  with no microphone and writes nothing to History.

## Open risks

- The 20-word threshold is a proposal until the owner's test call is measured.
- Every engine makes 1-3 number or name errors per hour (worst: law article numbers); the UI must show notes as AI
  output to check.
- Qwen3.5-4B needs a 3 GB download on Macs without Apple Intelligence and a key; an hour takes 4-12 minutes.
- Dictation in parallel shares one microphone stream between two pipelines.
- Screen-share hiding, heat and battery are untested.
- Phase 2 was not run in the app with a real call and the microphone (the owner's microphone is not recorded
  without consent); the tap → transcript → notes path is measured with `--meeting-probe` only.
- Both tracks stay in memory as 16 kHz floats until the meeting ends (about 230 MB per hour per track).

## Next safe step

Phase 1 is on `main` (185cc1d, wblekhoa/speakease#2). Phase 2 on branch `claude/meeting-notes-p2`; then phase 3
(Meetings page).
