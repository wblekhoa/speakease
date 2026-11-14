---
status: active
owner: Lê Khoa
started: 2026-11-14
current-phase: work orders written for all four streams after the owner's round 2, none dispatched; stream 1 goes first
summary: "Order of work and builder work orders for live help in a meeting: Me / Others by sound (1A-1D), transcript (2A-2F), the live panel (3A-3C) and the help features (4A-4E), each small enough for one builder."
tags: [area/ai, area/audio, area/capture, stack/rust, stack/react]
---

# Live help in a meeting — plan and work orders

Source of truth: `docs/product/decisions.md` entry 2026-11-14 and `docs/product/specs/2026-11-14-meeting-live-help.md`.
This plan orders the work and gives each task a work order. It decides nothing the spec has not.

## Order

| Stream | What                 | Work orders                                    | Needs                                                                               |
| ------ | -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1      | Me / Others by sound | 1A → 1B → 1C → 1D                              | nothing; the owner accepted spec item 1.3 in round 2                                |
| 2      | Transcript           | 2A → 2B; 2C → 2F; 2C → 2E; 2D is a measurement | 2B needs 2A; 2F needs 1B, 2B and 2C; 2E needs 2C and 3A                             |
| 3      | The live panel       | 3A → 3B → 3C                                   | 3A changes settings and `LiveView`, so it lands before anything else in streams 3-4 |
| 4      | Help features        | 4A → 4B → 4C → 4D → 4E                         | 4B needs 3A and 4A; 4C-4E need 3C                                                   |

Whole order: 1A, 1B, 1C, 1D, then 2A, 2B, 2C, 2F (files the panel work does not touch), then 3A, 3B, 3C, then 4A-4E,
then 2E. Two orders never run at the same time when their **Files** lists share a file.

New rules get the next free ids, added to `docs/product/logic/meetings.md` by the builder in the commit that makes
them true: SE-MEET-026 paragraphs and time marks (2A, 2B) · 027 punctuation fix (2C) · 028 live-line fix (2E) ·
029 help switches in place of levels (3A) · 030 the window's three states, size and place (3B) · 031 tabs and
marks (3C) · 032 the live lists (4A, 4B) · 033 answer help (4C) · 034 asking in a meeting (4D) · 035 the lists
kept with the meeting (4E) · 036 the Others track kept and the meeting recognised again (2F).

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

---

## Rules for the work orders of streams 2-4

Besides the rules above:

- Every user-facing string goes through i18next: add the key to `src/i18n/locales/en/translation.json` and
  `vi/translation.json` in the same commit (`bun run check:translations`).
- Colours and spacing come from the tokens the file already uses; no new colour, no new dependency. A need for
  either is a "Stop and report".
- `src/bindings.ts` is generated by tauri-specta when the app runs in dev. A builder that cannot run the app
  edits it by hand to match the Rust side exactly and says so in the report.
- Front-end gate for these orders: `bun run lint && bun run build && bun run test:unit && bun run check:translations`.
- UI orders (2A, 3A-3C, 4C-4E) are built against the spec's "Design contract — Live panel" and its Forbidden
  defaults; the coordinator runs `jak-hq:design-edit` on the captures before merge.

---

## Work order 2A — the transcript reads as paragraphs and sentences

**Goal**: where a saved meeting's transcript is read, runs of the same speaker are one paragraph, cut into
sentences. The stored text does not change.

**Spec items**: 2.1, 2.7 · rule SE-MEET-026.

**Read first**: `src/lib/meeting.ts` (`transcriptLine`, `summaryLine`); `src/lib/meeting.test.ts`;
`src/components/settings/meetings/MeetingsPage.tsx` (the Transcript tab and how an answer marks a line);
`ai-memory/lessons/reflowing-stored-text-is-rewriting-the-original.md`.

**Files**: `src/lib/meeting.ts`; `src/lib/meeting.test.ts`; `src/components/settings/meetings/MeetingsPage.tsx`.

**Build**

```ts
export type Sentence = { text: string; line: number }; // line: 1-based number of the stored line it came from
export type Paragraph = { speaker: string | null; firstLine: number; sentences: Sentence[] };
/** Stored lines "[Tôi] …" / "[Người khác] …" (or bare lines) as paragraphs. Blank lines are skipped but counted. */
export const paragraphs = (transcript: string): Paragraph[];
/** Cuts at . ! ? … followed by a space and an upper-case letter or a digit; never inside a number (3.5, 15.11). */
export const sentences = (text: string): string[];
```

A paragraph ends when the speaker changes, or after 6 sentences (a new paragraph, same speaker). The Transcript tab
renders paragraphs; a line marked by an answer marks the sentences whose `line` matches and scrolls to the first.
Copy and export keep using the stored text.

**Tests** (`meeting.test.ts`)

| Test                                           | Must hold                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| consecutive lines of one speaker join          | 3 "[Tôi]" lines then 1 "[Người khác]" → 2 paragraphs, first with `firstLine` 1                                 |
| every word survives                            | the paragraphs' sentence texts joined equal the stored lines' texts joined (labels removed)                    |
| numbers are not cut                            | "Giá là 3.5 triệu. Hạn là 15.11." → 2 sentences                                                                |
| a line without end punctuation is one sentence | holds                                                                                                          |
| blank lines keep the numbering                 | a sentence after a blank line carries the stored line's number as `number_lines` in `meeting_ask.rs` counts it |
| a microphone-only transcript                   | bare lines → paragraphs with `speaker: null`, cut every 6 sentences                                            |

**Do not**: change what is stored, `transcriptLine`, `summaryLine`, export, or any Rust file.

**Stop and report** when a citation from Ask cannot be mapped to a sentence.

**Done when**: the tests pass; the front-end gate passes; the report has a capture of the tab from the browser
preview.

---

## Work order 2B — a time mark on each paragraph

**Needs**: 2A merged.

**Goal**: each paragraph shows `mm:ss` from the meeting's start, for meetings recorded after this change.

**Spec items**: 2.2, 2.7 · rule SE-MEET-026.

**Read first**: `src-tauri/src/meeting.rs` (`Turn`, `transcript`, `transcribe_tracks`, `finish`);
`src-tauri/src/managers/history.rs` (the `meetings` migrations, `Meeting`, `save_meeting`, `map_meeting` and the
test `migrations_add_the_meetings_table`).

**Files**: `src-tauri/src/meeting.rs`; `src-tauri/src/managers/history.rs`; `src/bindings.ts`; `src/lib/meeting.ts`;
`src/lib/meeting.test.ts`; `src/components/settings/meetings/MeetingsPage.tsx`; `docs/product/logic/meetings.md`.

**Build**

1. A pure function beside `transcript`: `pub fn line_starts(turns: &[Turn]) -> Vec<u32>`: the start in
   milliseconds of each turn, in the order and with the same turns `transcript` prints (one entry per printed line,
   blank lines not counted).
2. A new migration (append to the list, never edit an old one): `ALTER TABLE meetings ADD COLUMN line_starts TEXT`.
   It holds a JSON array of numbers, or NULL. `Meeting` gets `pub line_starts: Option<Vec<u32>>`; `save_meeting`
   takes it; a meeting made from Files passes `None`.
3. Front end: `paragraphs(transcript, starts?)` gives each paragraph `startMs: number | null` (the start of its
   first line); the tab shows `elapsed`-style `mm:ss` before the speaker, and nothing when it is null.

**Tests**: Rust - `line_starts` has one entry per printed line for a transcript with dropped echo turns; the
migration test reads a row written before the column existed as `None`; a row round-trips `[0, 4200, 9100]`.
TypeScript - with starts the first paragraph's `startMs` is its first line's; without, every `startMs` is null; a
starts array shorter than the lines gives null from where it ends.

**Do not**: put the time inside the stored transcript; change the History entry's text.

**Stop and report** when the turns printed and the turns timed cannot be kept in step (for example the punctuation
fix of 2C changes the number of lines).

**Done when**: the tests pass; both gates pass; `logic/meetings.md` has SE-MEET-026.

---

## Work order 2C — AI fixes punctuation and capitals after the meeting

**Goal**: after Stop, each line of the saved transcript gets its punctuation and capitals fixed by the notes
engine, and never a changed word.

**Spec items**: 2.4 · rule SE-MEET-027.

**Read first**: `src-tauri/src/meeting_notes.rs` (`NotesAi`, `fence`, `ask_clean`, `engine_for`, `EngineAi`,
`split_into_parts`, the `FakeAi` in its tests); `src-tauri/src/meeting.rs` `finish` (where the transcript is stored
and the notes are started); `ai-memory/lessons/check-new-triggers-against-sibling-no-ai-rules.md`.

**Files**: new `src-tauri/src/meeting_punct.rs` (+ `mod meeting_punct;` in `lib.rs`); `src-tauri/src/meeting.rs`;
`docs/product/logic/meetings.md`.

**Build**

```rust
/// The words of a line, lower-cased, without punctuation: what must not change.
pub fn words(line: &str) -> Vec<String>;
/// Both are a line's text after its speaker label. `fixed` when its words equal `original`'s; otherwise `original`.
pub fn guarded<'a>(original: &'a str, fixed: &'a str) -> &'a str;
/// Numbered lines in, the same numbered lines out with punctuation and capitals fixed.
pub fn instructions(lang: Lang) -> String;
/// Reads "N: text" lines from the reply and applies `guarded` to each line's text, putting the line's own
/// "[label] " back in front; a missing or extra line leaves the original line.
pub fn apply(lines: &[&str], reply: &str) -> Vec<String>;
/// The whole transcript, in parts of at most `PART_WORDS` words cut at line ends. A part whose request
/// fails keeps its lines.
pub async fn punctuate<A: NotesAi>(ai: &A, transcript: &str) -> String;
```

The instructions fence the text as the notes prompts do, name the language, and say: keep every word and its
order, change only punctuation marks and capital letters, answer with the same numbered lines and nothing else.
`finish` calls `punctuate` after recognition and before the transcript is stored and the notes are written, only
when `engine_for` gives an engine; with no AI the transcript is stored as recognised and nothing is shown.

**Tests** (in `meeting_punct.rs`, with a fake `NotesAi`)

| Test name                                                 | Must hold                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `punctuation_and_capitals_are_taken`                      | "[Tôi] xin chào mọi người hôm nay họp về giá" + a reply with a capital and commas → the reply's text, label kept |
| `a_changed_word_keeps_the_original`                       | a reply that swaps, adds or drops one word → the original line (three cases)                                     |
| `a_reply_with_fewer_lines_keeps_the_missing_ones`         | holds                                                                                                            |
| `the_line_count_never_changes`                            | for a 40-line transcript and a reply that merges two lines, the result has 40 lines                              |
| `a_failed_part_keeps_its_lines`                           | the fake fails the second request; lines of that part are the originals                                          |
| `the_prompt_fences_the_text_and_refuses_its_instructions` | as the test of that name in `meeting_notes.rs`                                                                   |
| `vietnamese_tone_marks_are_words`                         | "ban" → "bạn" in the reply is a changed word                                                                     |

**Do not**: change `transcript`, `drop_echo`, the notes prompts, or what happens with no AI.

**Stop and report** when `finish` cannot wait for the fix without holding the bar's "finishing" state more than
it does for the notes (say what the state machine allows).

**Done when**: the seven tests pass; the builder gate passes; `logic/meetings.md` has SE-MEET-027 and the no-AI
row says the fix is skipped.

---

## Work order 2D — measurement: earlier words as the model's context (coordinator)

Not a builder's order. Spec item 2.3 WAITS for it.

1. With the probe of 1D and two speech files of 3+ minutes each (one Vietnamese, one English, made with `say`),
   recognise each file span by span twice with a Whisper-family model: with today's prompt, and with the last 30
   words of the same track added after the custom words (a throwaway patch, not committed).
2. Count per run: spans whose text repeats the prompt's words although the audio does not hold them; spans left
   empty; word error against the script.
3. Write the figures into the spec's Change log. Clean (no repeated span, error not worse) → write work order 2G
   for it; otherwise set 2.3 to "not built" with the figures.

---

## Work order 2E — AI fixes each live line lightly

**Needs**: 2C and 3A merged.

**Goal**: with its switch on, a live line shows as recognised, then with punctuation and capitals fixed.

**Spec items**: 2.5 · rule SE-MEET-028.

**Read first**: `src-tauri/src/meeting_live.rs` (the recognising thread, `update`, `ask_ai`);
`src-tauri/src/meeting_punct.rs`; `src-tauri/src/settings.rs` (`MeetingHelp` from 3A).

**Files**: `src-tauri/src/meeting_live.rs`; `src-tauri/src/settings.rs`; `src/bindings.ts`; the Settings card that
3A made; both locale files; `docs/product/logic/meetings.md`.

**Build**: a setting `meeting_live_fix: bool`, default false, with a switch under the help switches whose
description says a request is made per line and that a saved key is charged for each. A third thread takes
`(meeting, at_ms, me, text)` of each new line from a channel, asks the notes engine with
`meeting_punct::instructions` for that one line, and on success replaces the line's text (found by `at_ms` and
`me`) through `update`, using `meeting_punct::guarded`. At most one request at a time; when more than 5 lines wait,
the oldest are dropped unfixed. Off, or no AI: no request.

**Tests**: pure helpers only - `replace_line(lines, at_ms, me, fixed)` replaces exactly one line and nothing when
the line is gone; `next_to_fix(queue)` keeps the newest 5. A unit test that with the setting off the queue is never
fed.

**Do not**: delay showing the raw line; fix a line twice; send more than one line per request.

**Done when**: the tests pass; both gates pass; SE-MEET-028 is in `logic/meetings.md` with the consent text.

---

## Work order 2F — the Others track is kept, and a meeting can be recognised again

**Needs**: 1B, 2B and 2C merged.

**Goal**: a meeting recorded with an app keeps the Others track in a second file, the Me track is rebuilt from it
and the mixed file, and a button on the saved meeting recognises it again with the model selected now, with Me /
Others as before.

**Why one track is enough**: the mixed file holds `(me + others) / 2` per sample, so `me = 2 × mixed − others`. A
trial on made-up signals written as the app writes them (16-bit, truncated) rebuilt Me within 3 steps of 16-bit
at every sample (signal-to-noise 60-86 dB; 21 of 320 000 samples went past full scale when both tracks clipped,
hence the clamp). Half the disk of keeping both tracks: about 115 MB for an hour instead of about 230 MB.

**Spec items**: 2.6 (owner 14/11: "Lưu riêng hai tiếng", then "Tìm cách nhẹ hơn") · rule SE-MEET-036 (SE-MEET-020 gains the second file).

**Read first**: `src-tauri/src/meeting.rs` (`mix`, `finish`, `transcribe_tracks`, `Finished`, `during_dictation`,
`write_notes_for`, the meeting state's phases); `src-tauri/src/audio_toolkit/audio/utils.rs` (`save_wav_file`);
`src-tauri/src/managers/history.rs` (`delete_entry`, `delete_entries_and_files`, `update_transcription`,
`get_audio_file_path`, the `meetings` migrations); the meeting command file (`rewrite_meeting_notes`);
`src/components/settings/meetings/MeetingsPage.tsx` (the detail's three-dot menu);
`ai-memory/lessons/reflowing-stored-text-is-rewriting-the-original.md`.

**Files**: `src-tauri/src/meeting.rs`; new `src-tauri/src/meeting_tracks.rs` (+ `mod` line in `lib.rs`);
`src-tauri/src/managers/history.rs`; the meeting command file; `src/bindings.ts`;
`src/components/settings/meetings/MeetingsPage.tsx`; `src/lib/meeting.ts` + test; both locale files;
`docs/product/logic/meetings.md`, `docs/product/ux/meetings.md`.

**Build**

```rust
// meeting_tracks.rs - pure, no app handle
/// "file-meeting-170000.wav" -> "file-meeting-170000.others.wav".
pub fn others_name(file_name: &str) -> String;
/// The Me track from the two saved files' samples: `2 × mixed − others` per sample, in whole 16-bit steps, then
/// clamped to full scale. `others` shorter than `mixed` counts as silence from where it ends.
pub fn rebuild_me(mixed: &[i16], others: &[i16]) -> Vec<f32>;
/// A one-channel, 16 kHz, 16-bit file's samples as written. An error for any other format or a missing file.
pub fn read_i16(path: &Path) -> anyhow::Result<Vec<i16>>;
/// (me, others) for a saved meeting, from its mixed file and its Others file.
pub fn load_tracks(mixed: &Path, others: &Path) -> anyhow::Result<(Vec<f32>, Vec<f32>)>;
```

1. `finish` writes the Others track with `save_wav_file` beside the mixed file, only for a meeting with an app
   track. The mixed file stays exactly as it is: it is what History plays. A failure to write the Others file is
   logged and the meeting is still saved.
2. A new migration adds `dictations TEXT` to `meetings` (JSON `[[start_ms, end_ms], …]`, NULL when there were
   none), so a second pass marks the same lines as dictated. `Meeting` gets `has_tracks: bool`, true when the
   Others file is on disk (looked up when the meeting is read, not stored).
3. `delete_entry` and `delete_entries_and_files` remove `others_name(file_name)` whenever they remove the file.
4. `session::recognise_again(app, history_id) -> Result<(), String>` and a command `recognise_meeting_again`:
   refuses while a meeting records or is being finished (`busy`); loads the tracks; runs `transcribe_tracks` with
   the stored dictations and `speaker_labels = true`; then `meeting_punct::punctuate` as `finish` does; then
   stores the text with `update_transcription` and the new `line_starts`. When recognition fails or gives an
   empty transcript, the stored transcript is left as it was and the error is returned. The notes are not
   rewritten.
5. The detail's three-dot menu gets "Nhận dạng lại" / "Recognise again", only when `has_tracks`. It asks first:
   the transcript will be replaced by what the model selected now hears, and the notes stay as written until
   "Viết lại ghi chú" is pressed. While it runs the Transcript tab shows a working line; afterwards a quiet line
   on the Notes tab says the notes were written from the earlier transcript, until they are written again.

A meeting recorded with the microphone only, a recording from Files, and a meeting saved before this change have
no Others file and no button.

**Tests**

| Test                                         | Must hold                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `the_others_file_is_named_after_the_meeting` | the example above; a name without ".wav" gets ".others.wav" appended                                                                                                                                                 |
| `me_is_rebuilt_within_three_steps`           | Me and Others tones of different lengths, mixed with `mix` and both written with `save_wav_file` into a temp folder: every sample of `load_tracks`'s Me is within 3/32767 of the original, and Others within 1/32767 |
| `a_rebuilt_sample_never_passes_full_scale`   | `rebuild_me(&[32767], &[-32768])` is `[1.0]`                                                                                                                                                                         |
| `a_short_others_file_counts_as_silence`      | `rebuild_me(&[100, 100], &[50])` is `[150, 200]` in 16-bit steps                                                                                                                                                     |
| `a_two_channel_file_is_refused`              | `read_i16` on a two-channel file is an error                                                                                                                                                                         |
| `deleting_a_meeting_removes_both_files`      | in a temp recordings folder, after `delete_entry` neither file is there                                                                                                                                              |
| `cleanup_removes_both_files`                 | the same through `delete_entries_and_files`                                                                                                                                                                          |
| `the_mixed_file_is_unchanged`                | for the same input, the bytes of the mixed file equal those written before this change                                                                                                                               |
| `a_failed_second_pass_keeps_the_transcript`  | a pure `replace_with(old, new: Result<String, String>)` returns `old` for an error and for an empty text                                                                                                             |
| `dictations_round_trip`                      | a row with `[[1000, 4000]]` reads back; a row from before the column reads as none                                                                                                                                   |
| TypeScript: `canRecogniseAgain(meeting)`     | true only with `has_tracks`                                                                                                                                                                                          |

**Do not**: change `mix`, `save_wav_file` or what History plays (the rebuild depends on both exactly as they
are); make the second pass automatic; rewrite the notes without a press; recognise the mixed file alone when
the Others file is missing; put the Others file in the History list; add an audio encoder (a new dependency).

**Stop and report** when `transcribe_tracks` cannot be called outside `finish` without the bar showing a recording
(say what the state machine needs), or when the transcript has hand edits stored somewhere this order does not
know of.

**Done when**: the tests pass; both gates pass; `logic/meetings.md` has SE-MEET-036 and states the disk cost
(one more channel at 16 kHz, 16-bit: about 115 MB for an hour, beside about 115 MB for the mixed file); the report
has captures of the menu, the question and the Notes line from the browser preview.

---

## Work order 3A — a switch per feature in place of the five levels

**Goal**: nine switches decide what live help does; the levels and "Live help at the start" are gone.

**Spec items**: 3.9, 4.1, 4.5 · rule SE-MEET-029 (SE-MEET-005 and SE-MEET-023 change in this commit).

**Read first**: `src-tauri/src/settings.rs` (`meeting_live_level`, `meeting_ask_on_call`, their defaults and
tests); `src-tauri/src/commands/` where `set_meeting_live_level` and `change_meeting_live_level_setting` live;
`src-tauri/src/meeting_live.rs` (every use of `LEVEL` and `view.level`); `src/components/settings/MeetingLiveLevel.tsx`;
`src/meeting/MeetingPanel.tsx`; `docs/product/logic/meetings.md` rows SE-MEET-005 and SE-MEET-023.

**Files**: those, plus `src/bindings.ts`, both locale files, `docs/product/ux/meetings.md`.

**Build**

```rust
/// What live help does in a meeting; one switch each (SE-MEET-029).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
pub struct MeetingHelp {
    pub transcript: bool, pub summary: bool, pub decisions: bool, pub catch_up: bool, pub actions: bool,
    pub questions: bool, pub terms: bool, pub ask: bool,
    /// 0 off · 1 questions others ask me · 2 also questions I say aloud.
    pub answer: u8,
}
/// The switches a stored level stood for, never more than that level did: 1 none · 2 transcript ·
/// 3 + catch_up · 4 + summary · 5 + decisions, actions, questions, terms, answer 1. `ask` is new: off.
pub fn help_from_level(level: u8) -> MeetingHelp;
/// Lines are recognised when any switch is on; `transcript` only decides whether they are shown.
pub fn wants_lines(help: MeetingHelp) -> bool;
/// An AI request may be made: any switch besides `transcript` is on.
pub fn wants_ai(help: MeetingHelp) -> bool;
```

`AppSettings` gets `meeting_help: Option<MeetingHelp>`; when it is `None` on load it is filled from
`help_from_level(meeting_live_level)`. `meeting_live_level` stays in the struct for old files and is read nowhere
else. One command `change_meeting_help_setting(help: MeetingHelp)` stores it and, in a meeting, updates the live
view at once. `LiveView.level` is replaced by `help: MeetingHelp`; every `level >= n` in `meeting_live.rs` becomes
the matching switch: the recognising work runs when `wants_lines` (a help feature needs the lines although Lời
nói is off; the tab then shows its off state and the lines are kept only in memory, as today); `catch_up` for
"what did I miss"; `summary` for the summary; the suggestions request runs when `questions`, `terms`, `actions`,
`decisions` or `answer` is on, until 4B replaces it. With every switch off no thread recognises and no AI
request is made. Settings: a card "Trợ giúp khi đang
họp" with nine rows grouped under the five tab names, in place of `MeetingLiveLevel`. The panel's level buttons
are removed; the panel shows what the switches allow.

**Tests**: `help_from_level` for 1-5 and for 0 and 9 (clamped); settings without `meeting_help` load with the
level's switches, and settings with it keep it; no level turns on a switch whose work that level did not do
(`help_from_level(3)` has `summary == false`, `help_from_level(4)` has `actions == false`, every level has
`ask == false`); `wants_ai` is false for all-off and for transcript-only; `wants_lines` is true with only
`summary` on and false for all-off; the existing tests `levels_stay_between_one_and_five` and its like are replaced, not deleted
without a successor.

**Do not**: change what the summary or the suggestions say (stream 4 does); remove the `meeting_live_level` field.

**Stop and report** when a use of the level has no switch that fits.

**Done when**: the tests pass; both gates pass; `logic/meetings.md` and `ux/meetings.md` describe switches, not
levels.

---

## Work order 3B — the window: three states, any size, any place, remembered

**Needs**: 3A merged.

**Goal**: the bar can be small, a bar, or a bar with a panel; the panel is resized by its edges, the whole thing
is dragged, and the next meeting opens it where and as it was left.

**Spec items**: 3.2-3.6 · rule SE-MEET-030 (SE-MEET-016 changes).

**Read first**: `src-tauri/src/meeting_window.rs` (all); `src-tauri/src/subtitle_window.rs` (`fit_frame`,
`prevent_activation`); `src/subtitles/LiveSubtitles.tsx` (dragging, the edge handles, `POSITION_KEY`, `LOOK_KEY`);
`src/meeting/MeetingBar.tsx`, `MeetingBar.css`; lessons `fit-window-to-natural-height`, `panel-click-activates-app`,
`panel-builder-no-activate-hides-app`.

**Files**: `src-tauri/src/meeting_window.rs`; the command file that holds `set_meeting_panel`; `src/bindings.ts`;
`src/meeting/MeetingBar.tsx`, `MeetingBar.css`; new `src/lib/meetingFrame.ts` + `meetingFrame.test.ts`; both locale
files; `docs/product/logic/meetings.md`, `docs/product/ux/meetings.md`.

**Build**

```ts
export type BarState = "small" | "bar" | "panel";
export type Frame = { x: number; y: number; width: number; panelHeight: number; state: BarState };
export const LIMITS = { minWidth: 380, maxWidth: 900, minPanel: 220, maxPanel: 900, small: { width: 150, height: 36 }, barHeight: 64 };
/** A stored frame made to fit: sizes within LIMITS, and the top centre of `screen` when no part of the bar would be on it. */
export const fitFrame = (stored: Partial<Frame> | null, screen: { x: number; y: number; width: number; height: number }): Frame;
/** The window's size for a state. */
export const sizeFor = (frame: Frame): { width: number; height: number };
```

Rust: `set_frame(app, x, y, width, height)` (position and size in one main-thread call, as `fit_frame` does) and a
command `set_meeting_frame`; `set_panel(open)` stays for the session's own use. The front end keeps the frame in
`localStorage` (`meeting-frame`), reads it when the bar mounts, calls `set_meeting_frame`, and writes it after
every drag, resize or state change. Drag by the bar (not by its buttons); resize by the panel's left, right and
bottom edges and bottom corners (handles 6 px, cursor set, no visible line). The small state shows the recording
dot, the time and the count (the count is a prop here; 3C feeds it); a press on it returns to the state before it.
A button on the bar goes small. The window's size changes at once: no CSS transition on width or height.

**Tests** (`meetingFrame.test.ts`): nothing stored → top centre, `bar`; sizes clamp to LIMITS; a frame fully off
the screen falls back to top centre and keeps its size and state; a frame half on the screen is kept; `sizeFor` for
the three states.

**Do not**: make the window key or focusable; change `keep_out_of_screen_sharing`; add `.no_activate(true)`;
animate the window's size.

**Stop and report** when a drag or a resize makes SpeakEase the frontmost app (check `lsappinfo front` before and
after in the dev build), or when the panel cannot be resized from the web side without a native handler.

**Done when**: the tests pass; both gates pass; the report has captures of the three states and states which of
drag / resize / remember were checked in a running dev build and which were not.

---

## Work order 3C — five tabs, each with its switch and its mark

**Needs**: 3B merged.

**Goal**: the panel has the tabs Lời nói · Tóm tắt · Việc · Gợi ý · Hỏi; each has an on/off button; a tab that is
not open shows what it gathered.

**Spec items**: 3.1, 3.6, 3.8 · rule SE-MEET-031 · the spec's "Design contract — Live panel".

**Read first**: `src/meeting/MeetingPanel.tsx`, `MeetingBar.tsx`, `MeetingBar.css`; `src/bindings.ts` (`LiveView`,
`MeetingHelp`); the spec's design contract and Acceptance for streams 3 and 4.

**Files**: `src/meeting/MeetingPanel.tsx` (may be split into `src/meeting/tabs/*.tsx`), `MeetingBar.tsx`,
`MeetingBar.css`; new `src/lib/meetingTabs.ts` + test; both locale files; `docs/product/ux/meetings.md`.

**Build**

```ts
export const TABS = ["transcript", "summary", "actions", "suggestions", "ask"] as const;
export type Tab = (typeof TABS)[number];
/** The switches a tab's button turns on or off together. */
export const tabSwitches: Record<Tab, (keyof MeetingHelp)[]>; // summary: summary, decisions, catch_up · suggestions: questions, terms, answer · …
export const tabOn = (help: MeetingHelp, tab: Tab): boolean; // any of its switches on
export const toggled = (help: MeetingHelp, tab: Tab): MeetingHelp; // all on ↔ all off (answer: 0 ↔ 1; step 2 is set in Settings only)
/** How many items each tab holds now. */
export const counts = (view: LiveView): Record<Tab, number>;
/** Items added since the tab was last open; the open tab and an off tab are 0. */
export const unseen = (now: Record<Tab, number>, seen: Record<Tab, number>, open: Tab, help: MeetingHelp): Record<Tab, number>;
export const barCount = (u: Record<Tab, number>): number; // the sum without "transcript"
```

Each tab's header row: its name, the on/off button (calls `change_meeting_help_setting(toggled(...))`), and when
off one line saying what turning it on does (and, for AI tabs with a saved key, that it is charged). A tab's mark:
the unseen count, or a small dot while its feature has a request running. Lời nói keeps today's line list (Me /
Others labels, stays at the newest line unless the user scrolled up). Until stream 4 lands, Tóm tắt shows the
summary and "Tôi bỏ lỡ gì", Việc and Gợi ý show today's suggestions of their kinds (action · question, term,
answer, unsettled, earlier), and Hỏi shows its off / coming state. The bar's small state gets `barCount`.

**Tests** (`meetingTabs.test.ts`): `toggled` turns a mixed tab all on, then all off; `unseen` is 0 for the open
tab, for an off tab, and never negative when a list shrinks; `barCount` leaves out the transcript; `counts` from a
view with 3 lines, a summary and 2 action suggestions.

**Do not**: put a card inside a card; mark a new item with a coloured left border; move the line being read when
an item arrives on another tab; add a tab per kind of suggestion.

**Done when**: the tests pass; the front-end gate passes; captures of each tab (content, empty, off) at the least
and the greatest panel size, light and dark, are in the report.

---

## Work order 4A — the live lists (a pure module)

**Goal**: one reply from the AI updates the summary, the decided and open points, the action items, the questions
to ask and the terms, and the lists remember the meeting.

**Spec items**: stream 4's table, 4.2 · rule SE-MEET-032.

**Read first**: `src-tauri/src/meeting_live.rs` lines 1-200 (`Suggestion`, the instructions, `parse_suggestions`
and their tests); `src-tauri/src/meeting_notes.rs` (`fence`, `Lang`).

**Files**: new `src-tauri/src/meeting_assist.rs` (+ `mod meeting_assist;` in `lib.rs`).

**Build**

```rust
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct Assist {
    pub summary: Option<String>,
    pub decided: Vec<Item>, pub open: Vec<Item>, pub actions: Vec<Action>,
    pub questions: Vec<Item>, pub terms: Vec<Term>,
}
pub struct Item { pub text: String, pub at_ms: u32 }
pub struct Action { pub what: String, pub who: Option<String>, pub when: Option<String>, pub at_ms: u32 }
pub struct Term { pub name: String, pub meaning: String, /// true: from the AI's own knowledge, shown as unchecked.
    pub unchecked: bool, pub at_ms: u32 }
/// Which lists to ask for.
pub struct Wanted { pub summary: bool, pub decisions: bool, pub actions: bool, pub questions: bool, pub terms: bool }

/// One line per item: `summary: …` (up to 5) · `decided: …` · `open: …` · `settled: <an open point, as listed>` ·
/// `action: what | who | when` · `question: …` (up to 3) · `term: name | meaning | meeting|own`. Only the wanted kinds.
pub fn instructions(lang: Lang, wanted: Wanted) -> String;
/// The lists so far (so the AI adds, not repeats) and the new lines, each in its own fence.
pub fn request_text(prev: &Assist, new_lines: &str) -> String;
/// What one reply holds: the new items, and the open points it says are settled.
pub struct Parsed { pub lists: Assist, pub settled: Vec<String> }
pub fn parse(reply: &str, at_ms: u32) -> Parsed; // unknown kinds, "none" and chatter are dropped
pub fn merge(prev: Assist, new: Parsed) -> Assist;
```

`merge` rules: the summary is replaced when the new one is there; `decided`, `open`, `actions` and `terms` only
grow (an item whose text - or term name - equals an old one, ignoring case and outer punctuation, is not added
twice; an action with the same `what` updates `who` / `when` when they were empty); a `settled:` line moves the
matching open point to `decided`; `questions` are replaced by the new ones, and kept when the reply has none; each
list keeps at most 50 items, dropping the oldest. A term with `own` is `unchecked: true`. The instructions say the
`own` label is required whenever the meaning is not stated in the meeting.

**Tests** (in the module): one per merge rule above (eight), plus: `the_reply_is_read_by_kind_and_the_rest_dropped`;
`an_action_with_missing_parts_is_read` ("action: gửi báo giá" → who and when `None`); `only_wanted_kinds_are_asked_for`
(the instructions for `Wanted { actions: true, .. }` name `action:` and not `term:`); `the_prompt_fences_the_meeting`
(as the test of that kind in `meeting_live.rs`).

**Do not**: call the AI, touch `meeting_live.rs`, or keep anything outside the returned value.

**Done when**: the tests pass; the builder gate passes.

---

## Work order 4B — the live lists run for the whole meeting

**Needs**: 3A and 4A merged.

**Goal**: the refresh thread fills `Assist` instead of the summary and the suggestion cards, for every feature
that is on, whether or not the panel is open.

**Spec items**: 4.1, 4.2 · rule SE-MEET-032 (SE-MEET-007 changes).

**Read first**: `src-tauri/src/meeting_live.rs` `session` (the thread "Levels 4-5", `ask_ai`, `update`, `end`);
`src-tauri/src/meeting_assist.rs`.

**Files**: `src-tauri/src/meeting_live.rs`; `src/bindings.ts`; `src/lib/meetingTabs.ts` (`counts`) and its test;
`src/meeting/` tab files (Tóm tắt, Việc, Gợi ý read `view.assist`); both locale files; `docs/product/logic/meetings.md`.

**Build**: `LiveView` gets `assist: Assist` and `working: bool`; `summary` and `suggestions` are removed with
`Suggestion`, `suggestion_instructions`, `summary_instructions`, `parse_suggestions` and their tests (each replaced
by 4A's). The refresh thread: when `refresh_due`, builds `Wanted` from the switches; with nothing wanted it makes
no request; otherwise one request with `meeting_assist::instructions` and `request_text(prev, lines since the last
refresh, at most LIVE_WORDS)`, then `merge(prev, parse(reply, now))`. `working` is true while the request runs. A failed request leaves the
lists and is logged without the meeting's words. Việc shows the actions as a checklist the user can tick (ticks
live in the panel's state only); Tóm tắt shows the summary, then Đã chốt and Chưa chốt; Gợi ý shows the questions
and the terms A-Z with the "chưa kiểm chứng" label on unchecked ones.

**Tests**: a pure `wanted(help) -> Wanted`; `new_lines_since(lines, last_ms)`; that an all-off `Wanted` yields no
request (`should_ask(wanted, due) == false`); TypeScript `counts` reads the new lists.

**Do not**: tie the refresh to `panel_open` or to the open tab; send the whole meeting each time (only the new
lines plus the lists).

**Stop and report** when `refresh_due`'s two-minute rhythm makes the first lists arrive later than they do today.

**Done when**: the tests pass; both gates pass; SE-MEET-032 is in `logic/meetings.md` and SE-MEET-007 points to it.

---

## Work order 4C — answer help appears by itself

**Needs**: 4B and 3C merged.

**Goal**: when someone asks the user a question, a card with 1-3 short points to answer with appears on Gợi ý
without a press.

**Spec items**: "Trả lời giúp" in stream 4's table, 4.5 · rule SE-MEET-033.

**Read first**: `src-tauri/src/meeting_live.rs` (the recognising thread, `ask_ai`, `lines_text`).

**Files**: `src-tauri/src/meeting_live.rs`; new `src-tauri/src/meeting_answer.rs` (+ `mod` line); `src/bindings.ts`;
the Gợi ý tab file; `src/lib/meetingTabs.ts` + test; both locale files; `docs/product/logic/meetings.md`.

**Build**

```rust
/// A cheap first look, no AI: an Others line that ends with "?" or holds a question word
/// (vi: "không", "chưa", "sao", "thế nào", "bao giờ", "ai", "gì", "mấy", "bao nhiêu" at the line's end or before "?";
/// en: starts with who/what/when/where/why/how/can/could/do/does/did/is/are/will/would/should).
pub fn may_be_a_question(line: &str) -> bool;
/// Asks: is the last line a question put to the user (marked as themselves)? If not, answer only "none".
/// If so: 1-3 short points the user could answer with, only from what the meeting said; say so when it holds no answer.
pub fn instructions(lang: Lang) -> String;
pub struct AnswerCard { pub question: String, pub points: Vec<String>, pub at_ms: u32 }
pub fn parse(question: &str, reply: &str, at_ms: u32) -> Option<AnswerCard>; // "none" → None; at most 3 points
```

When `help.answer >= 1`, the meeting is not microphone-only, and a new Others line passes `may_be_a_question`: one
request with the last `LIVE_WORDS` of lines; a card goes to `view.answers` (newest first, at most 10). At most one
such request at a time and one per 20 s; a line that arrives meanwhile is skipped. The card shows the question,
the points, and nothing to send or paste (as SE-MEET-007 says of suggestions).

**Tests**: `may_be_a_question` on 8 Vietnamese and 6 English lines (questions and statements, including "Mình
không đồng ý." → false); `parse` for "none", for 2 points, for 5 points (3 kept); a pure `may_ask(now_ms, last_ms,
busy)` for the 20 s rule; no request when `answer == 0` or for a "Me" line.

**Do not**: answer a question the user asked; show a card for "none"; make a request for every Others line.

**Done when**: the tests pass; both gates pass; SE-MEET-033 names the costs with a saved key.

---

## Work order 4D — asking AI in a meeting, typed or said aloud

**Needs**: 4C merged.

**Goal**: on the Hỏi tab the user types a question and gets an answer from this meeting with the lines it used; a
"Me" line that starts with the cue is taken as a question too.

**Spec items**: 4.3, 4.4, 4.5 · rule SE-MEET-034.

**Read first**: `src-tauri/src/meeting_ask.rs` (`number_lines`, `context_for`, `ask`, `MeetingAnswer`);
`src-tauri/src/meeting_window.rs` (the panel is built with `can_become_key_window: false` and `focusable(false)`);
`src-tauri/src/subtitle_window.rs` `prevent_activation`; lessons `panel-click-activates-app`,
`panel-builder-no-activate-hides-app`.

**Files**: `src-tauri/src/meeting_live.rs`; `src-tauri/src/meeting_window.rs`; the meeting command file;
`src/bindings.ts`; the Hỏi tab file; both locale files; `docs/product/logic/meetings.md`, `ux/meetings.md`.

**Build**

1. `session::ask(app, question) -> Result<MeetingAnswer, String>`: the live lines as a numbered transcript
   (`[Tôi] …` / `[Người khác] …`, the same text `lines_text` gives without the word limit) through
   `meeting_ask::ask`; the question and answer are added to `view.asked` (newest first). Command `ask_live_meeting`.
2. The keyboard: `meeting_window::set_typing(app, on)`. On: remember the frontmost app, let the panel become key
   and make it key. Off: resign key and bring the remembered app to the front. The Hỏi tab calls it with `true`
   when the question box is clicked and `false` on Enter (after sending), Escape, blur, a tab change, the small
   state and Stop. The panel must never stay key after the box loses focus.
3. Said aloud, when `help.answer == 2`: a pure `spoken_question(line: &str) -> Option<&str>` returns the rest of a
   "Me" line that begins with "SpeakEase" or "trợ lý" (any case, then an optional comma) and has at least three
   more words; that text goes through `session::ask` and the answer lands on Hỏi with its mark.

**Tests**: `spoken_question` ("SpeakEase, giá gói năm là bao nhiêu" → the rest; "trợ lý ơi" → None; a line that
only mentions SpeakEase in the middle → None); the live transcript handed to `meeting_ask` numbers lines as
`number_lines` does; an empty meeting returns the "nothing said yet" error.

**Do not**: keep the panel key outside the question box; type into or click in the meeting app; change
`can_become_key_window` to true for the whole life of the window if `set_typing(false)` cannot take it back.

**Stop and report** when the panel cannot take the keyboard without SpeakEase's main window coming forward, or
cannot give it back: report what `tauri_nspanel` allows. The fallback (asking in the main window) is the owner's
call, not the builder's.

**Done when**: the tests pass; both gates pass; the report states, from a dev build, the frontmost app before the
click, while typing and after Enter (three `lsappinfo front` results).

---

## Work order 4E — the lists are kept with the meeting

**Needs**: 4D merged.

**Goal**: after Stop, what the live lists held is saved and shown as a tab of the saved meeting.

**Spec items**: 4.6 · rule SE-MEET-035.

**Read first**: `src-tauri/src/meeting.rs` `finish`; `src-tauri/src/meeting_live.rs` `session::end`, `view`;
`src-tauri/src/managers/history.rs` (`meetings` migrations, `save_meeting`, `Meeting`);
`src/components/settings/meetings/MeetingsPage.tsx` (the detail's tabs).

**Files**: `src-tauri/src/meeting.rs`; `src-tauri/src/meeting_live.rs`; `src-tauri/src/managers/history.rs`;
`src/bindings.ts`; `src/components/settings/meetings/MeetingsPage.tsx`; `src/lib/meeting.ts` + test; both locale
files; `docs/product/logic/meetings.md`, `ux/meetings.md`.

**Build**: `session::taken() -> Option<Kept>` returns the lists before `end` clears the view
(`Kept { assist: Assist, answers: Vec<AnswerCard>, asked: Vec<(String, MeetingAnswer)> }`, `None` when all are
empty). A new migration adds `live_lists TEXT` to `meetings` (JSON of `Kept`, or NULL); `Meeting` gets
`live_lists: Option<Kept>`. `finish` stores it with the meeting. The detail view gets a fourth tab "Trong cuộc họp"
/ "During the meeting", only when `live_lists` is there: the summary, Đã chốt, Chưa chốt, Việc, the questions, the
terms (with their label) and the questions asked with their answers, read-only. The written notes are still made
from the transcript alone. Copy and export do not include the tab (AI default; say so in `ux/meetings.md`).

**Tests**: Rust - `taken` is `None` for an empty view and `Some` when one action exists; a row round-trips `Kept`;
a row from before the column reads `None`. TypeScript - a pure `hasLiveLists(meeting)`; the tab list has three
entries without and four with.

**Do not**: change the notes prompts, the transcript, or what delete removes (the row goes with the meeting, as
today).

**Done when**: the tests pass; both gates pass; captures of the detail with and without the tab are in the report.

---

## Coordinator checks after streams 2-4

1. A made-up meeting through the probe of 1D with every switch on: the lists fill, a question in the app's file
   gives an answer card, and with every switch off the log shows no AI request.
2. Before any check in a running build: `ps -axo command= | grep -E 'capture_speakeas[e]|screencaptur[e] -v'`,
   and keep windows off the owner's primary screen.
3. `jak-hq:design-edit` on the captures of 3B, 3C, 4C, 4D and 4E with the spec's design contract.
4. Owner: one real meeting with every feature on; then the figures of 1B's log line for the echo threshold.
