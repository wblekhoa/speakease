---
status: active
owner: Lê Khoa
started: 2026-11-14
current-phase: stream 1 work orders written, none dispatched (they wait for the owner's answer on spec item 1.3); streams 2-4 wait for the owner's round 2
summary: "Order of work and builder work orders for live help in a meeting: stream 1 (Me / Others by sound) is written as four work orders and waits for one owner answer; transcript, panel and features follow after round 2."
tags: [area/ai, area/audio, area/capture, stack/rust, stack/react]
---

# Live help in a meeting — plan and work orders

Source of truth: `docs/product/decisions.md` entry 2026-11-14 and `docs/product/specs/2026-11-14-meeting-live-help.md`.
This plan orders the work and gives each task a work order. It decides nothing the spec has not.

## Order

| Stream | What                 | State                                                                                                    |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| 1      | Me / Others by sound | Work orders 1A-1D below, written. BLOCKED: dispatch none until the owner answers spec item 1.3 (round 2) |
| 2      | Transcript quality   | Waits for round 2 (items 2.3, 2.5, 2.6, 2.7)                                                             |
| 3      | The live panel       | Waits for round 2 (items 3.6-3.9)                                                                        |
| 4      | Help features        | Waits for round 2 (triggers, tabs, typing, when AI runs)                                                 |

Spec item 1.3 (what happens to the user's words under a louder echo) is PROPOSED, and 1A builds it: no work order
of stream 1 is dispatched before the owner's answer is in `decisions.md` and the item reads DECIDED. If the answer
changes the rule, change 1A's method and tests first.

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
- After 1D: build, run the coordinator check, then ask the owner for one call on speakers and one on headphones,
  and read each call's `Meeting: echo check:` log line to set `FOLLOWS`.

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

Builder gate (what CI runs, plus the front end's fast gate):

```bash
cd src-tauri && cargo fmt -- --check && cargo test --lib meeting
```

```bash
bun run gate:fast
```

CI does not run clippy. Run `cargo clippy --lib` and leave no new warning in a file you changed; warnings that were
there before are not yours to fix.

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

/// How much the microphone's stretch `me_low[start..start + len]` is a copy
/// of the app's sound, 0.0-1.0, and the lag in low samples (milliseconds)
/// at which it matches best; (0.0, 0) for a stretch with no sound. Both
/// inputs are low tracks on the same clock (index 0 is the meeting's
/// start); a track counts as silence past its end.
pub fn best_match(me_low: &[f32], others_low: &[f32], start: usize, len: usize) -> (f32, i32);

/// `best_match` for each window of the microphone, one per `HOP`.
pub fn likeness(me_low: &[f32], others_low: &[f32]) -> Vec<(f32, i32)>;

/// For each low sample of the microphone: true when it is the app's sound
/// heard by the microphone.
pub fn echo_mask(me_low: &[f32], others_low: &[f32]) -> Vec<bool>;

/// The 16 kHz microphone track with its echo set to silence, same length.
/// For recognition only; never save it.
pub fn without_echo(me: &[f32], others: &[f32]) -> Vec<f32>;
```

How `best_match` decides (constants are starting values; this method was tried on 14/11, figures below):

1. A stretch whose mean square is below `QUIET = 1e-6` has no sound: (0.0, 0).
2. For each lag from `-LAG` to `+LAG` low samples (`LAG = 500`, half a second either way: the two tracks' clocks are
   not exact), take the app's stretch `others_low[start - lag .. start - lag + len]`. Skip a lag whose stretch is out
   of range or quiet. Likeness = `|sum(me * app)| / sqrt(sum(me * me) * sum(app * app))`. Return the best and its
   lag.

How `echo_mask` decides:

1. Windows of `WINDOW = 1000` low samples (1 s) in steps of `HOP = 500` (`likeness`).
2. A window is echo when its likeness is at least `FOLLOWS = 0.6`.
3. A low sample is echo only when every window that covers it is echo. (A window that holds the user's voice at
   least as loud as the echo is not echo, so those words are kept whole.)

`without_echo` sets the 16 samples of each echo low sample to 0.0 and copies the rest (a tail shorter than `STEP`
is copied).

**What the trial showed** (throwaway scripts, 14 s tracks; "speech" from `say` in two voices and, separately, noise
in bursts; the echo was the app's track 90 ms late at 0.3 gain through five reflections plus noise):

| Case                                                                                                   | Likeness                                                                          | Silenced                                                                          |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Microphone holds only the echo                                                                         | 0.81-0.91 per 1 s window                                                          | 94-100 % of the sounding frames (the microphone 300 ms early, 90 and 400 ms late) |
| Microphone holds only the user's voice                                                                 | 0.05-0.29                                                                         | nothing                                                                           |
| The user speaks over an echo of the same loudness or quieter                                           | median 0.21-0.53                                                                  | 0-3 % of the user's frames; the echo inside those windows stays                   |
| The user speaks over an echo twice as loud, four times as loud                                         | median 0.69, 0.78                                                                 | 84 %, 92 % of the user's frames: the limit in spec item 1.3                       |
| The user speaks for 6 s, then only the app                                                             | as rows 3 and 1                                                                   | 0 % of the first 6 s, 100 % after second 7                                        |
| The app's track rebuilt as the product does (`place_chunk`, chunks of 20-100 ms arriving 0-60 ms late) | median 0.79-0.84                                                                  | 89-93 %                                                                           |
| The same with chunks of 500 ms                                                                         | median 0.69                                                                       | 64 %: how large the tap's chunks are is not measured                              |
| One stretch of 0.4 s, 0.6 s, 3 s through `best_match`                                                  | echo 0.76-0.95; the user's voice at most 0.46; the user over the app at most 0.41 | (the live check, work order 1C)                                                   |

Comparing loudness per 30 ms frame instead of the sound itself was also tried and failed: two unrelated voices
matched by chance in 14 % of frames. Do not go back to it. Real rooms echo more than the trial's five reflections,
so the likeness of a real echo is not measured yet; `FOLLOWS` waits for the owner's call (work order 1D prints the
figures).

**Tests** (in `meeting_echo.rs`, `#[cfg(test)] mod tests`). Build tracks with a small deterministic generator in the
test module (for example xorshift noise multiplied by a burst pattern); no files, no clock. "Speech" is noise in
bursts of 150-400 ms with gaps of 80-250 ms at RMS about 0.1, each burst at its own loudness (0.5-1.5 times).
"Echo of X" is X late by the stated delay, at 0.3 gain, summed with copies 7, 19 and 43 ms later at 0.5, 0.35 and
0.2 of that, plus noise at RMS 0.002. Each track is 14 s at 16 kHz.

| Test name                                          | Setup                                                                                                                                             | Must hold                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `an_echo_only_microphone_is_silenced`              | app = speech A; microphone = echo of A, 90 ms late                                                                                                | at least 90 % of the microphone's low samples from second 1 to second 13 are echo                               |
| `the_echo_may_arrive_early_or_late`                | as above with the microphone 300 ms early, then 400 ms late                                                                                       | at least 90 % in both                                                                                           |
| `my_own_voice_is_never_silenced`                   | app = speech A; microphone = speech B (another seed)                                                                                              | no low sample is echo                                                                                           |
| `my_voice_over_the_app_is_kept`                    | app = speech A; microphone = echo of A (0.3 gain) + speech B                                                                                      | no low sample is echo                                                                                           |
| `the_echo_after_i_stop_is_silenced`                | microphone = echo of A + speech B for the first 6 s only                                                                                          | none echo in seconds 0-6; at least 90 % echo in seconds 7-13                                                    |
| `a_silent_app_silences_nothing`                    | app = zeros; microphone = speech B                                                                                                                | no low sample is echo                                                                                           |
| `silencing_keeps_the_length_and_my_samples`        | `without_echo` on the fifth setup                                                                                                                 | same length as the input; the first 6 s equal the input sample for sample; seconds 7-13 are at least 90 % zeros |
| `a_short_stretch_is_matched_on_its_own`            | `best_match` on stretches of 600 ms taken every second from the first and third setups                                                            | at least 0.7 for every echo stretch with sound; below 0.5 for every stretch of the user's voice                 |
| `my_voice_as_loud_as_the_echo_is_kept`             | microphone = echo of A at 1.0 gain + speech B                                                                                                     | at most 10 % of the low samples are echo                                                                        |
| `an_app_track_placed_in_late_chunks_still_matches` | the app's track rebuilt with `crate::meeting::place_chunk` from 100 ms chunks, each arriving 0-60 ms late (deterministic); microphone = echo of A | at least 80 % of the microphone's low samples from second 1 to second 13 are echo                               |

**Speed**: `echo_mask` on one hour of both tracks must take under 30 s in a release build on the build Mac. State
the measured time for 10 minutes of generated tracks (`cargo test --release --lib meeting_echo -- --ignored` on a test named
`ten_minutes_are_checked_quickly`, marked `#[ignore]`).

**Do not**: read or write files; use `Instant` or threads; change `drop_echo`; call this module from anywhere yet;
compare loudness in place of the sound.

**Stop and report** when a named test cannot pass with any constants you try in 5 attempts: report the best figures
per test and the constants.

**Done when**: the ten tests pass; the speed figure is reported; the builder gate passes; `lib.rs` differs by one
line.

---

## Work order 1B — the saved transcript uses the detector

**Needs**: 1A merged.

**Goal**: after Stop, echo stretches of the microphone are not recognised.

**Spec items**: 1.1, 1.4, 1.5, 1.6 · rule SE-MEET-025.

**Read first**: `src-tauri/src/meeting.rs` `transcribe_tracks`, `finish`, `mix`, `drop_echo` and the test
`the_others_heard_through_the_microphone_are_dropped`.

**Files**: `src-tauri/src/meeting.rs`; `src-tauri/src/meeting_echo.rs` (step 4 only); `docs/product/logic/meetings.md`.

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
4. One log line per meeting with an app track, numbers only, so a real call can be measured (the saved audio is the
   mix, so it cannot be measured afterwards). In `meeting_echo.rs`:

   ```rust
   /// What the echo check saw: for the log, never shown.
   pub struct EchoFigures { pub windows: usize, pub p10: f32, pub median: f32, pub p90: f32, pub usual_lag_ms: i32, pub silenced_s: f32 }
   pub fn echo_figures(likeness: &[(f32, i32)], mask: &[bool]) -> EchoFigures;
   ```

   `windows` counts the windows with a likeness above 0.0; the quantiles are over those; `usual_lag_ms` is the
   median lag of the windows at or above `FOLLOWS` (0 when none); `silenced_s` is the echo low samples / 1000. Log
   it once in `transcribe_tracks` at info level as `Meeting: echo check: <windows> windows, likeness p10 <..>
median <..> p90 <..>, usual lag <..> ms, <..> s silenced`. No words of the meeting, no file names.

**Tests** (in `meeting.rs`'s test module)

| Test name                                              | Must hold                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a_microphone_that_only_echoes_the_app_gives_no_spans` | with the 1A "echo only" setup (copy the small generator into this test module), `speech_spans` over `heard_tracks`' microphone, with a loudness-based `is_speech` closure (frame RMS above 0.02), returns no span that starts after second 1 and ends before second 13 |
| `a_microphone_only_meeting_is_recognised_as_recorded`  | `heard_tracks(me, &[], false)` returns `me` unchanged, borrowed                                                                                                                                                                                                        |
| `the_echo_figures_count_only_windows_with_sound`       | for likeness `[(0.0, 0), (0.2, 5), (0.8, 90), (0.9, 90), (0.7, 88)]` and a mask of 2,500 true out of 4,000: 4 windows, usual lag 90 ms, 2.5 s silenced, p10 <= median <= p90                                                                                           |
| `the_saved_audio_keeps_the_echo`                       | `mix(me, Some(others))` gives the same samples before and after calling `heard_tracks` (the input is not changed)                                                                                                                                                      |

**Docs, same commit**: add the row SE-MEET-025 to `docs/product/logic/meetings.md` with the rule text from the spec,
status `not built` (it stays so until the owner's call), and these tests plus 1A's as Evidence; in the SE-MEET-008 row
add one sentence pointing to SE-MEET-025. Bump `updated`.

**Do not**: change `speech_spans`, `CUTS`, `drop_echo`, `transcript` or anything in `session::record`.

**Stop and report** when `transcribe_tracks` cannot use the result without changing its signature.

**Done when**: the four tests pass; every test that passed before still passes; the builder gate passes.

---

## Work order 1C — the live panel uses the detector

**Needs**: 1B merged.

**Goal**: a live "Me" line that is the app's echo is never recognised or shown.

**Spec items**: 1.2, 1.6 · rule SE-MEET-025.

**Read first**: `src-tauri/src/meeting_live.rs` `session::begin` (the thread that "cuts both tracks into lines"),
`now_ms`, `STARTED`; `src-tauri/src/live_subtitles.rs` `Segment`.

**Files**: `src-tauri/src/meeting_live.rs`; `src-tauri/src/live_subtitles.rs` (the one field `ended`);
`docs/product/logic/meetings.md` (Evidence of SE-MEET-025 only).

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
       /// Whether the microphone between `start_ms` and `end_ms` is a copy of the app's sound.
       pub fn is_echo(&self, start_ms: u64, end_ms: u64) -> bool;
   }
   ```

   `add` writes `meeting_echo::low(samples)` so its last low sample sits at `end_ms` (one low sample is 1 ms); a gap
   before it is silence (as `meeting::place_chunk` does for samples). `is_echo` asks
   `meeting_echo::best_match(me, others, start, len)` for the stretch itself, both tracks indexed from the same
   moment, and returns true when the likeness is at least `ECHO_LINE = 0.6` (starting value). One likeness for the
   whole stretch: do not cut the app's track to a slice around it (tried on 14/11, the slice's edges gave wrong
   answers). A stretch shorter than 300 ms is never echo.

2. In the cutting thread: keep one `Recent`. While the level is 2 or more, call `add` for every chunk of either
   track with `now_ms()` as its end; at level 1 keep nothing and clear it. When the
   segmenter returns a segment for the microphone and the meeting is not `microphone_only`, ask
   `segment_span_ms` (below) for its place on the meeting's clock and skip the segment when `is_echo` is true.
   Segments of the app's track are never skipped.

   `segment.samples` is not the stretch that ends at `speech_end`: it starts with up to `PREROLL_MS` of frames from
   before the first voiced frame and ends with the silent frames that closed it (about 400 ms at a pause), while
   `speech_end` is the last voiced frame. So do not subtract the segment's length from `speech_end`. Instead:
   - In `live_subtitles.rs`, add one field to `Segment`: `/// When the segment's last frame arrived.`
     `pub ended: Instant`, set in `Segmenter::segment` from the last frame taken (`taken.last()`), for both
     `close_all` and `cut_at_quietest`. Fill it wherever a `Segment` is built. Nothing else in that file changes.
   - In `meeting_live.rs`, a pure function:

     ```rust
     /// The segment's samples on the meeting's clock: (start_ms, end_ms).
     pub fn segment_span_ms(segment: &Segment, started: Instant) -> (u64, u64);
     ```

     end = the time from `started` to `segment.ended`; start = end minus the samples' length
     (`samples.len() / 16` ms), not below 0.

   Frames cut from one chunk are stamped when the chunk arrives, so the span can sit up to one chunk late; `LAG`
   and the 300 ms floor cover that. Say in the report how long the microphone's chunks are (log the first few
   lengths once at debug level while testing, then remove the line).

3. Keep at most the last 60 s in `Recent` (drop older low samples, keep the clock right).

**Tests** (in `meeting_live.rs`'s test module; copy the small generator)

| Test name                                                  | Must hold                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a_live_line_that_echoes_the_app_is_skipped`               | chunks of 100 ms of app speech and its echo (90 ms late) added in order; `is_echo` over a 3 s stretch is true                                                                                                                                                                                                               |
| `a_short_echo_is_skipped_too`                              | the same tracks; `is_echo` over a 600 ms stretch that has sound is true                                                                                                                                                                                                                                                     |
| `an_echo_that_arrives_before_the_apps_chunk_is_skipped`    | the microphone's chunks 300 ms ahead of the app's; `is_echo` over a 3 s stretch is true                                                                                                                                                                                                                                     |
| `a_live_line_in_my_own_voice_is_kept`                      | app speech and an unrelated microphone; `is_echo` is false for a 600 ms and a 3 s stretch                                                                                                                                                                                                                                   |
| `a_real_segment_is_placed_by_its_last_frame`               | a real `Segmenter` fed 30 ms frames stamped `base + i * 30 ms`: 300 ms silence, 1.2 s voiced, then silence until it closes; `segment_span_ms(&segment, base)` gives an end within 30 ms of the last frame fed and a start within 30 ms of that end minus the samples' length; the end is at least 300 ms after `speech_end` |
| `a_segment_cut_at_the_length_limit_is_placed_too`          | the same `Segmenter` fed voiced frames until `cut_at_quietest` returns a segment; the span's end is within 30 ms of the stamp of the last frame in that segment (not of the last frame fed)                                                                                                                                 |
| `sound_older_than_a_minute_is_dropped_and_the_clock_holds` | after 90 s of chunks, the kept length is at most 60 s and `is_echo` over the last 3 s still answers as in the first test                                                                                                                                                                                                    |

**Do not**: change `Feed`, `Samples`, `LiveLine`, `LiveView`, the recognising thread, how `Segmenter` cuts, or
anything in `meeting.rs`.

**Stop and report** when the segment's place on the meeting's clock cannot be worked out from `STARTED` and
`ended`, or when the microphone's chunks are longer than 200 ms.

**Done when**: the seven tests pass; every live-subtitles test that passed before still passes
(`cargo test --lib live_subtitles`); the builder gate passes.

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
   `meeting_echo::likeness` of the two files to stderr as one line `likeness 0.82@90 0.85@90 …` (two decimals, then the lag in ms); prints each
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
