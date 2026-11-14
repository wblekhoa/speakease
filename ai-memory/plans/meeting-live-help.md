---
status: active
owner: Lê Khoa
started: 2026-11-14
current-phase: stream 1 work orders written, none dispatched; streams 2-4 wait for the owner's round 2
summary: "Order of work and builder work orders for live help in a meeting: stream 1 (Me / Others by sound) is ready to dispatch in four work orders; transcript, panel and features follow after round 2."
tags: [area/ai, area/audio, area/capture, stack/rust, stack/react]
---

# Live help in a meeting — plan and work orders

Source of truth: `docs/product/decisions.md` entry 2026-11-14 and `docs/product/specs/2026-11-14-meeting-live-help.md`.
This plan orders the work and gives each task a work order. It decides nothing the spec has not.

## Order

| Stream | What                 | State                                                    |
| ------ | -------------------- | -------------------------------------------------------- |
| 1      | Me / Others by sound | Work orders 1A-1D below, ready                           |
| 2      | Transcript quality   | Waits for round 2 (items 2.3, 2.5, 2.6, 2.7)             |
| 3      | The live panel       | Waits for round 2 (items 3.6-3.9)                        |
| 4      | Help features        | Waits for round 2 (triggers, tabs, typing, when AI runs) |

Stream 1 runs in order: 1A, then 1B, then 1C, then 1D. 1B, 1C and 1D each change a file another one reads, so they
never run at the same time.

## For the coordinator

- One work order, one builder (Sonnet), one branch `feat/meeting-echo-<letter>` from `main`, one pull request on
  `wblekhoa/speakease`. Give the builder the work order's text and nothing else; it reads the files the order names.
- Every pull request gets an Opus reviewer (`jak-hq:two-axis-review`). The reviewer's Spec axis is the work order's
  "Done when" list plus the spec items it names.
- "Coordinator checks" in an order are yours, never the builder's: they need speech files, the installed app or the
  owner.
- A builder that hits a "Stop and report" condition gets no fix from you in the same session: read its report,
  change the work order, dispatch again.
- After 1D: build, run the coordinator check, then ask the owner for one call on speakers and one on headphones.

## Rules every work order carries

1. Change only the files listed under "Files". Need another file → stop and report.
2. Do not add a dependency, change a setting's default, touch `CLAUDE.md` / `AGENTS.md` / workflow files, or rename
   an existing public function.
3. The tests named in the order are the contract. You may add tests; you may not weaken a named one. Constants
   marked "starting value" may be tuned to make the named tests pass; say which you changed.
4. Each rule in code or test carries its REQ-ID as a one-line comment (`// SE-MEET-025`), as the file already does.
5. User-facing text goes through i18n, in `src/i18n/locales/en/translation.json` and `vi/translation.json`.
6. Commit with a conventional prefix; the message says why. Do not push to `main`.
7. Report in this shape: files changed · tests added (names) · each command and its result (pass / fail, counts) ·
   constants changed · anything you could not verify. "Not run" is never "pass".

Builder gate, run from the repo root unless the order says otherwise:

```bash
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test meeting
```

```bash
bun run gate:fast
```

---

## Work order 1A — the echo detector (a pure module)

**Goal**: a module that says which stretches of the microphone track are the meeting app's sound heard through the
speakers. No I/O, no Tauri types, no threads.

**Spec items**: 1.1, 1.3, 1.4 · rule SE-MEET-025.

**Read first**: `src-tauri/src/meeting.rs` lines 1-160 (`RATE`, `Span`, `speech_spans`, `drop_echo`).

**Files**: new `src-tauri/src/meeting_echo.rs`; `src-tauri/src/lib.rs` (one line, `mod meeting_echo;` after
`mod meeting_ask;`).

**Build**

```rust
/// Both tracks are compared at 1 kHz: one low sample is the mean of 16
/// samples of the 16 kHz track.
pub const STEP: usize = 16;

/// A 16 kHz track at 1 kHz (whole groups of `STEP` samples only).
pub fn low(samples: &[f32]) -> Vec<f32>;

/// The best likeness (0.0-1.0) of each microphone window to the app's sound,
/// one value per `HOP`; 0.0 for a window with no sound. `echo_mask` is built
/// on it.
pub fn likeness(me_low: &[f32], others_low: &[f32]) -> Vec<f32>;

/// For each low sample of the microphone: true when it is the app's sound
/// heard by the microphone. Both inputs are low tracks on the same clock
/// (index 0 is the meeting's start); a track counts as silence past its end.
pub fn echo_mask(me_low: &[f32], others_low: &[f32]) -> Vec<bool>;

/// The 16 kHz microphone track with its echo set to silence, same length.
/// For recognition only; never save it.
pub fn without_echo(me: &[f32], others: &[f32]) -> Vec<f32>;

/// Of the microphone's low samples in windows that have sound, the share
/// that is echo (0.0 when no window has sound).
pub fn echo_share(me_low: &[f32], others_low: &[f32]) -> f32;
```

How `echo_mask` decides (constants are starting values; this method was tried on 14/11, figures below):

1. Slide a window of `WINDOW = 1000` low samples (1 s) over the microphone in steps of `HOP = 500`.
2. A window whose mean square is below `QUIET = 1e-6` has no sound: not echo.
3. For each lag from `-LAG` to `+LAG` low samples (`LAG = 500`, half a second either way: the two tracks' clocks are
   not exact), take the app's window `others_low[start - lag .. start - lag + WINDOW]`. Skip a lag whose window is
   out of range or quiet. Likeness = `|sum(me * app)| / sqrt(sum(me * me) * sum(app * app))`. Keep the best over
   all lags.
4. The window is echo when the best likeness is at least `FOLLOWS = 0.6`.
5. A low sample is echo only when every window that covers it is echo. (A window that holds the user's voice is
   never echo, so the user's words are kept whole.)

`without_echo` sets the 16 samples of each echo low sample to 0.0 and copies the rest (a tail shorter than `STEP`
is copied).

**What the trial showed** (a throwaway script, 14 s tracks; "speech" from `say` in two voices and, separately, noise
in bursts; the echo was the app's track 90 ms late at 0.3 gain through five reflections plus noise):

| Case                                                | Best likeness per window        | Silenced                                                        |
| --------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Microphone holds only the echo                      | 0.81-0.91                       | 94-100 % of the sounding frames (delays of -300, 90 and 400 ms) |
| Microphone holds only the user's voice              | 0.05-0.29                       | 0 samples                                                       |
| The user speaks over the app, same loudness or half | 0.13-0.54                       | 0 % of the user's frames; the echo inside those windows stays   |
| The user speaks for 6 s, then only the app          | as above, then as the first row | 0 % of the first 6 s, 100 % after second 7                      |

Comparing loudness per 30 ms frame instead of the sound itself was also tried and failed: two unrelated voices
matched by chance in 14 % of frames. Do not go back to it. Real rooms echo more than the trial's five reflections,
so the likeness of a real echo is not measured yet; `FOLLOWS` waits for the owner's call (work order 1D prints the
figures).

**Tests** (in `meeting_echo.rs`, `#[cfg(test)] mod tests`). Build tracks with a small deterministic generator in the
test module (for example xorshift noise multiplied by a burst pattern); no files, no clock. "Speech" is noise in
bursts of 150-400 ms with gaps of 80-250 ms at RMS about 0.1, each burst at its own loudness (0.5-1.5 times).
"Echo of X" is X late by the stated delay, at 0.3 gain, summed with copies 7, 19 and 43 ms later at 0.5, 0.35 and
0.2 of that, plus noise at RMS 0.002. Each track is 14 s at 16 kHz.

| Test name                                             | Setup                                                       | Must hold                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `an_echo_only_microphone_is_silenced`                 | app = speech A; microphone = echo of A, 90 ms late          | at least 90 % of the microphone's low samples from second 1 to second 13 are echo                               |
| `the_echo_may_arrive_early_or_late`                   | as above with the microphone 300 ms early, then 400 ms late | at least 90 % in both                                                                                           |
| `my_own_voice_is_never_silenced`                      | app = speech A; microphone = speech B (another seed)        | no low sample is echo                                                                                           |
| `my_voice_over_the_app_is_kept`                       | app = speech A; microphone = echo of A + speech B           | no low sample is echo                                                                                           |
| `the_echo_after_i_stop_is_silenced`                   | microphone = echo of A + speech B for the first 6 s only    | none echo in seconds 0-6; at least 90 % echo in seconds 7-13                                                    |
| `a_silent_app_silences_nothing`                       | app = zeros; microphone = speech B                          | no low sample is echo                                                                                           |
| `silencing_keeps_the_length_and_my_samples`           | `without_echo` on the fifth setup                           | same length as the input; the first 6 s equal the input sample for sample; seconds 7-13 are at least 90 % zeros |
| `the_share_is_high_for_an_echo_and_zero_for_my_voice` | `echo_share` on the first and third setups                  | at least 0.9, and exactly 0.0                                                                                   |

**Speed**: `echo_mask` on one hour of both tracks must take under 30 s in a release build on the build Mac. State
the measured time for 10 minutes of generated tracks (`cargo test --release -- --ignored` on a test named
`ten_minutes_are_checked_quickly`, marked `#[ignore]`).

**Do not**: read or write files; use `Instant` or threads; change `drop_echo`; call this module from anywhere yet;
compare loudness in place of the sound.

**Stop and report** when a named test cannot pass with any constants you try in 5 attempts: report the best figures
per test and the constants.

**Done when**: the eight tests pass; the speed figure is reported; the builder gate passes; `lib.rs` differs by one
line.

---

## Work order 1B — the saved transcript uses the detector

**Needs**: 1A merged.

**Goal**: after Stop, echo stretches of the microphone are not recognised.

**Spec items**: 1.1, 1.4, 1.5, 1.6 · rule SE-MEET-025.

**Read first**: `src-tauri/src/meeting.rs` `transcribe_tracks`, `finish`, `mix`, `drop_echo` and the test
`the_others_heard_through_the_microphone_are_dropped`.

**Files**: `src-tauri/src/meeting.rs`; `docs/product/logic/meetings.md`.

**Build**

1. Add a pure function beside `speech_spans`:

   ```rust
   // SE-MEET-025
   /// The tracks to recognise: with an app track, the microphone without the
   /// app's echo; the microphone as it is for a microphone-only meeting.
   pub fn heard_tracks<'a>(me: &'a [f32], others: &'a [f32], speaker_labels: bool)
       -> (std::borrow::Cow<'a, [f32]>, &'a [f32]);
   ```

   It returns `meeting_echo::without_echo(me, others)` for the microphone when `speaker_labels` is true, else `me`
   borrowed.

2. In `transcribe_tracks`, cut and recognise the microphone from `heard_tracks`' result. Nothing else in that
   function changes; `drop_echo` still runs after it.
3. `finish` keeps passing `done.me` to `mix`: the saved audio is the untouched microphone.

**Tests** (in `meeting.rs`'s test module)

| Test name                                              | Must hold                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a_microphone_that_only_echoes_the_app_gives_no_spans` | with the 1A "echo only" setup (copy the small generator into this test module), `speech_spans` over `heard_tracks`' microphone, with a loudness-based `is_speech` closure (frame RMS above 0.02), returns no span that starts after second 1 and ends before second 13 |
| `a_microphone_only_meeting_is_recognised_as_recorded`  | `heard_tracks(me, &[], false)` returns `me` unchanged, borrowed                                                                                                                                                                                                        |
| `the_saved_audio_keeps_the_echo`                       | `mix(me, Some(others))` gives the same samples before and after calling `heard_tracks` (the input is not changed)                                                                                                                                                      |

**Docs, same commit**: add the row SE-MEET-025 to `docs/product/logic/meetings.md` with the rule text from the spec,
status `not built` (it stays so until the owner's call), and these tests plus 1A's as Evidence; in the SE-MEET-008 row
add one sentence pointing to SE-MEET-025. Bump `updated`.

**Do not**: change `speech_spans`, `CUTS`, `drop_echo`, `transcript` or anything in `session::record`.

**Stop and report** when `transcribe_tracks` cannot use the result without changing its signature.

**Done when**: the three tests pass; every test that passed before still passes; the builder gate passes.

---

## Work order 1C — the live panel uses the detector

**Needs**: 1B merged.

**Goal**: a live "Me" line that is the app's echo is never recognised or shown.

**Spec items**: 1.2, 1.6 · rule SE-MEET-025.

**Read first**: `src-tauri/src/meeting_live.rs` `session::begin` (the thread that "cuts both tracks into lines"),
`now_ms`, `STARTED`; `src-tauri/src/live_subtitles.rs` `Segment`.

**Files**: `src-tauri/src/meeting_live.rs`; `docs/product/logic/meetings.md` (Evidence of SE-MEET-025 only).

**Build**

1. A small pure type above `pub mod session`:

   ```rust
   // SE-MEET-025
   /// Both tracks' recent sound at 1 kHz on the meeting's clock, for the live echo check.
   #[derive(Default)]
   pub struct Recent { me: Vec<f32>, others: Vec<f32>, /* and what step 3 needs */ }

   impl Recent {
       /// Adds a chunk of one track that ended `end_ms` after the meeting's start.
       pub fn add(&mut self, me: bool, samples: &[f32], end_ms: u64);
       /// Whether the microphone between `start_ms` and `end_ms` is mostly echo.
       pub fn is_echo(&self, start_ms: u64, end_ms: u64) -> bool;
   }
   ```

   `add` writes `meeting_echo::low(samples)` so its last low sample sits at `end_ms` (one low sample is 1 ms); a gap
   before it is silence (as `meeting::place_chunk` does for samples). `is_echo` takes the microphone from `start_ms`
   to `end_ms` and the app's track from half a second before to half a second after, and returns
   `meeting_echo::echo_share(..) >= ECHO_LINE` (`ECHO_LINE = 0.7`, starting value).

2. In the cutting thread: keep one `Recent`. While the level is 2 or more, call `add` for every chunk of either
   track with `now_ms()` as its end; at level 1 keep nothing and clear it. When the
   segmenter returns a segment for the microphone and the meeting is not `microphone_only`, work out its start and
   end on the meeting's clock (end = the time from `STARTED` to `segment.speech_end`; start = end minus the
   segment's length) and skip the segment when `is_echo` is true. Segments of the app's track are never skipped.
3. Keep at most the last 60 s in `Recent` (drop older low samples, keep the clock right).

**Tests** (in `meeting_live.rs`'s test module; copy the small generator)

| Test name                                                  | Must hold                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `a_live_line_that_echoes_the_app_is_skipped`               | chunks of 100 ms of app speech and its echo added in order; `is_echo` over a 3 s stretch is true                         |
| `a_live_line_in_my_own_voice_is_kept`                      | app speech and an unrelated microphone; `is_echo` is false                                                               |
| `sound_older_than_a_minute_is_dropped_and_the_clock_holds` | after 90 s of chunks, the kept length is at most 60 s and `is_echo` over the last 3 s still answers as in the first test |

**Do not**: change `Feed`, `Samples`, `LiveLine`, `LiveView`, the recognising thread, or anything in `meeting.rs`.

**Stop and report** when the segment's place on the meeting's clock cannot be worked out from `STARTED` and
`speech_end`.

**Done when**: the three tests pass; the builder gate passes.

---

## Work order 1D — a probe that takes two sound files

**Needs**: 1C merged.

**Goal**: the coordinator can run both paths on two speech files without a microphone or a call.

**Spec items**: Acceptance, the coordinator line.

**Read first**: `src-tauri/src/cli.rs` (`meeting_probe`, `probe_seconds`, `probe_mute`); `src-tauri/src/lib.rs`
where `args.meeting_probe` is handled; `src-tauri/src/meeting.rs` `session::probe`;
`src-tauri/src/audio_toolkit/audio/utils.rs` `read_wav_samples`.

**Files**: `src-tauri/src/cli.rs`; `src-tauri/src/lib.rs`; `src-tauri/src/meeting.rs`; `AGENTS.md` is NOT changed
(hidden flags are not listed there).

**Build**

1. Two hidden flags: `--meeting-tracks <ME.wav>` and `--tracks-others <OTHERS.wav>` (16 kHz mono; `hide = true`,
   doc comments as the neighbours have). Add `meeting_tracks` to the "runs headless and exits" check in `lib.rs`
   where `meeting_probe` is listed.
2. `meeting::session::probe_tracks(app, me_path, others_path) -> Result<String, String>`: reads both files; starts
   the live session at level 2 (`meeting_live::session::feed` / `begin`, not microphone-only); sends both tracks in
   100 ms chunks at real-time pace on two threads (`(true, chunk)` and `(false, chunk)`); waits 3 s; prints
   `meeting_echo::likeness` of the two files to stderr as one line `likeness 0.82 0.85 …` (two decimals); prints each
   live line to stderr as `live <me|others> <seconds> <text>`; ends the live session; then returns
   `transcribe_tracks(app, &me, &others, &[], true)`.
3. `lib.rs` prints the returned transcript to stdout and exits 0, or prints the error and exits 1, as the
   `meeting_probe` branch does. Nothing is saved to History.

**Tests**: `clap` parsing of the two flags beside the existing CLI tests if `cli.rs` has them; otherwise none (the
function needs a model and an app handle).

**Do not**: change `probe`, record a microphone, play sound, or write files outside the temp directory.

**Done when**: the builder gate passes; `handy --help` does not list the flags; the report states that the probe
itself was not run by the builder.

**Coordinator checks** (not the builder's):

1. Make two files with different voices and different sentences, 20-30 s each, 16 kHz mono
   (`say -v <voice> -o … --data-format=LEI16@16000`), and a third: the app's file delayed 90 ms at 0.3 gain mixed
   into the user's file.
2. Run the probe with the mixed file as the microphone. Pass: every sentence of the user's script is under "Me"
   (live and saved), no sentence of the app's script is.
3. Run it with the echo alone as the microphone. Pass: no "Me" line, live or saved.
4. Build the app, then ask the owner for one call on speakers and one on headphones.
