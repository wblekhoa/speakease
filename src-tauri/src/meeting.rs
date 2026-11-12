//! SpeakEase meeting recording (phase 2 of `ai-memory/plans/meeting-notes-build.md`):
//! the microphone as "Me" and the meeting app's sound (a process tap, shared
//! with live subtitles) as "Others", recorded side by side; when the meeting
//! stops, both tracks are cut at pauses, recognised with the selected model,
//! merged by time into one transcript, saved as a History entry, and the notes
//! are written in the background (`meeting_notes`). Rules SE-MEET-001, 003,
//! 004, 006, 008, 013 in `docs/product/logic/meetings.md`.

use crate::live_subtitles::{Cuts, Segmenter, FRAME_SAMPLES};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::{Duration, Instant};

/// Recognition runs at this rate; both tracks are kept at it.
pub const RATE: usize = 16_000;
/// How long the app's sound is still read after Stop (SE-MEET-006).
const TAIL: Duration = Duration::from_secs(1);
const FRAME_MS: u64 = 30;

/// How the tracks are cut for recognition: at a 0.7 s pause, or at a short
/// breath after 12 s, never longer than 25 s (one recognition run).
const CUTS: Cuts = Cuts {
    pause_ms: 700,
    soft_ms: 12_000,
    max_ms: 25_000,
};

/// Who spoke a line (SE-MEET-008).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Speaker {
    /// The microphone track.
    Me,
    /// The meeting app's track.
    Others,
}

/// One recognised piece of speech, placed in time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Turn {
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: Speaker,
    pub text: String,
    /// Spoken while a dictation was recording (SE-MEET-001).
    pub dictation: bool,
}

/// A stretch of one track to recognise.
#[derive(Debug, Clone)]
pub struct Span {
    pub start_ms: u64,
    pub end_ms: u64,
    pub samples: Vec<f32>,
}

// SE-MEET-003
/// Puts a chunk of the app's sound into its track so it ends at `end_sample`
/// (when it arrived, counted from the meeting's start): silence fills a gap
/// the tap left (the app played nothing); a chunk that arrives early is
/// simply appended, so no sound is ever dropped.
pub fn place_chunk(track: &mut Vec<f32>, chunk: &[f32], end_sample: usize) {
    let start = end_sample.saturating_sub(chunk.len());
    if track.len() < start {
        track.resize(start, 0.0);
    }
    track.extend_from_slice(chunk);
}

/// Cuts a track into spans of speech with `is_speech` deciding per 30 ms
/// frame, with their place in time.
pub fn speech_spans(samples: &[f32], mut is_speech: impl FnMut(&[f32]) -> bool) -> Vec<Span> {
    let base = Instant::now();
    let mut segmenter = Segmenter::with_cuts(CUTS);
    let mut spans = Vec::new();
    let mut take = |segment: crate::live_subtitles::Segment| {
        let end_ms = segment.speech_end.duration_since(base).as_millis() as u64 + FRAME_MS;
        let samples_ms = (segment.samples.len() * 1000 / RATE) as u64;
        // A segment closed at a pause carries that pause after its speech.
        let trailing = if segment.capped { 0 } else { CUTS.pause_ms };
        let start_ms = (end_ms + trailing).saturating_sub(samples_ms);
        spans.push(Span {
            start_ms,
            end_ms,
            samples: segment.samples,
        });
    };
    for (i, frame) in samples.chunks_exact(FRAME_SAMPLES).enumerate() {
        let at = base + Duration::from_millis(i as u64 * FRAME_MS);
        if let Some(segment) = segmenter.push(frame, is_speech(frame), at) {
            take(segment);
        }
    }
    if let Some(segment) = segmenter.flush() {
        take(segment);
    }
    spans
}

/// Whether most of `start..end` falls inside one of the dictation ranges.
pub fn during_dictation(start_ms: u64, end_ms: u64, ranges: &[(u64, u64)]) -> bool {
    let length = end_ms.saturating_sub(start_ms).max(1);
    let covered: u64 = ranges
        .iter()
        .map(|&(from, to)| end_ms.min(to).saturating_sub(start_ms.max(from)))
        .sum();
    covered * 2 >= length
}

fn words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

/// Without headphones the microphone also hears the meeting app, so the
/// others' words come back as "Me". A "Me" line whose words are mostly in an
/// "Others" line at about the same time is that echo and is dropped.
pub fn drop_echo(turns: Vec<Turn>) -> Vec<Turn> {
    const NEAR_MS: u64 = 2_000;
    let others: Vec<(u64, u64, Vec<String>)> = turns
        .iter()
        .filter(|t| t.speaker == Speaker::Others)
        .map(|t| (t.start_ms, t.end_ms, words(&t.text)))
        .collect();
    turns
        .into_iter()
        .filter(|turn| {
            if turn.speaker != Speaker::Me || turn.dictation {
                return true;
            }
            let mine = words(&turn.text);
            if mine.len() < 3 {
                return true;
            }
            let heard: Vec<&String> = others
                .iter()
                .filter(|(start, end, _)| {
                    *start <= turn.end_ms + NEAR_MS && turn.start_ms <= end + NEAR_MS
                })
                .flat_map(|(_, _, w)| w)
                .collect();
            let echoed = mine.iter().filter(|w| heard.contains(w)).count();
            echoed * 10 < mine.len() * 6
        })
        .collect()
}

/// The labels a transcript uses, in the app's language.
pub struct Labels {
    pub me: &'static str,
    pub others: &'static str,
    pub dictation: &'static str,
    /// The title of a microphone-only meeting, before its date (SE-MEET-020).
    pub microphone: &'static str,
}

/// Vietnamese labels for a Vietnamese interface, English otherwise.
pub fn labels(app_language: &str) -> Labels {
    if app_language.starts_with("vi") {
        Labels {
            me: "Tôi",
            others: "Người khác",
            dictation: "đọc chính tả",
            microphone: "Micro",
        }
    } else {
        Labels {
            me: "Me",
            others: "Others",
            dictation: "dictation",
            microphone: "Microphone",
        }
    }
}

// SE-MEET-001, SE-MEET-008, SE-MEET-020
/// One line per turn in time order: `[Tôi] …`, `[Người khác] …`, and a
/// dictation as `[Tôi · đọc chính tả] …`. With `speaker_labels` false (a
/// microphone-only meeting: the microphone hears everyone in the room) a
/// line has no label and a dictation is `[đọc chính tả] …`.
pub fn transcript(turns: &[Turn], labels: &Labels, speaker_labels: bool) -> String {
    let mut ordered: Vec<&Turn> = turns.iter().filter(|t| !t.text.trim().is_empty()).collect();
    ordered.sort_by_key(|t| (t.start_ms, t.speaker == Speaker::Others));
    ordered
        .iter()
        .map(|turn| {
            let who = match (speaker_labels, turn.speaker, turn.dictation) {
                (false, _, true) => Some(labels.dictation.to_string()),
                (false, _, false) => None,
                (true, Speaker::Me, true) => Some(format!("{} · {}", labels.me, labels.dictation)),
                (true, Speaker::Me, false) => Some(labels.me.to_string()),
                (true, Speaker::Others, _) => Some(labels.others.to_string()),
            };
            match who {
                Some(who) => format!("[{who}] {}", turn.text.trim()),
                None => turn.text.trim().to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Where a meeting's sound comes from (SE-MEET-020).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum MeetingSource {
    /// The app [`pick_meeting_app`] finds, else the microphone only.
    Automatic,
    /// The microphone only: one track, no speaker labels.
    Microphone,
    /// This app's sound as "Others" (a bundle id); an error when it is not
    /// running.
    App(String),
}

// SE-MEET-020
/// The app whose sound a meeting from `source` records as "Others", or
/// `None` for the microphone only. Automatic never fails: with no app to
/// pick it records the microphone only. A named app must be running
/// (error "no-app: …").
pub fn resolve_source(
    source: &MeetingSource,
    running: &[crate::system_audio_tap::RunningApp],
    remembered: Option<&str>,
) -> Result<Option<String>, String> {
    match source {
        MeetingSource::Automatic => Ok(pick_meeting_app(running, remembered)),
        MeetingSource::Microphone => Ok(None),
        MeetingSource::App(bundle_id) => {
            if running.iter().any(|app| app.bundle_id == *bundle_id) {
                Ok(Some(bundle_id.clone()))
            } else {
                Err(format!("no-app: {bundle_id} is not running"))
            }
        }
    }
}

/// What a source menu offers (SE-MEET-020). "Microphone only"
/// is always offered and is not listed.
#[derive(Debug, Clone, Serialize, Type)]
pub struct MeetingSources {
    /// What Automatic would record now; `None` means the microphone only.
    pub automatic: Option<crate::system_audio_tap::RunningApp>,
    /// Each running call app or browser, in the order Automatic ranks them.
    pub apps: Vec<crate::system_audio_tap::RunningApp>,
}

// SE-MEET-020
/// The source menu's choices now, with Automatic resolved exactly as a
/// start resolves it.
pub fn meeting_sources(
    running: &[crate::system_audio_tap::RunningApp],
    remembered: Option<&str>,
) -> MeetingSources {
    let automatic = resolve_source(&MeetingSource::Automatic, running, remembered)
        .ok()
        .flatten()
        .and_then(|id| running.iter().find(|app| app.bundle_id == id).cloned());
    let mut apps: Vec<_> = running
        .iter()
        .filter_map(|app| {
            MEETING_APPS
                .iter()
                .position(|known| *known == app.bundle_id)
                .map(|rank| (rank, app.clone()))
        })
        .collect();
    apps.sort_by_key(|(rank, _)| *rank);
    MeetingSources {
        automatic,
        apps: apps.into_iter().map(|(_, app)| app).collect(),
    }
}

/// What a finished meeting is saved as.
#[derive(Debug, PartialEq, Eq)]
pub struct SavedAs {
    /// The History entry's title.
    pub title: String,
    /// The `meetings` row's `app_name`: empty for a microphone-only meeting.
    pub row_app: String,
    /// The app named to the kind guess.
    pub guess_app: Option<String>,
}

// SE-MEET-013, SE-MEET-020
/// `app_name` is the recorded app's name, `None` for the microphone only;
/// `when` is the start as "dd/mm HH:MM".
pub fn saved_as(app_name: Option<&str>, when: &str, labels: &Labels) -> SavedAs {
    SavedAs {
        title: format!("{} · {when}", app_name.unwrap_or(labels.microphone)),
        row_app: app_name.unwrap_or_default().to_string(),
        guess_app: app_name.map(str::to_string),
    }
}

// SE-MEET-020
/// The two tracks as one, for the History entry's audio. `others` is
/// `None` for a microphone-only meeting, which has no app track: its audio
/// is the microphone as recorded, not halved. An app track that stayed
/// silent is still mixed, so a meeting's level never depends on whether
/// the other side spoke.
pub fn mix(me: &[f32], others: Option<&[f32]>) -> Vec<f32> {
    let Some(others) = others else {
        return me.iter().map(|s| s.clamp(-1.0, 1.0)).collect();
    };
    let len = me.len().max(others.len());
    (0..len)
        .map(|i| {
            let a = me.get(i).copied().unwrap_or(0.0);
            let b = others.get(i).copied().unwrap_or(0.0);
            ((a + b) * 0.5).clamp(-1.0, 1.0)
        })
        .collect()
}

/// Apps whose sound is a meeting: video and voice calls first (SE-MEET-002
/// lists them), then browsers, where Google Meet runs.
pub const MEETING_APPS: [&str; 12] = [
    "us.zoom.xos",
    "com.microsoft.teams2",
    "com.microsoft.teams",
    "com.vng.zalo",
    "com.facebook.archon",
    "com.apple.FaceTime",
    "com.tinyspeck.slackmacgap",
    "com.hnc.Discord",
    "com.google.Chrome",
    "com.apple.Safari",
    "company.thebrowser.Browser",
    "com.microsoft.edgemac",
];

/// Where the browsers start in [`MEETING_APPS`].
const FIRST_BROWSER: usize = 8;

/// The app to record as "Others" when the user did not pick one: a call app
/// that is playing, else one that is running, else the app recorded last
/// time if it is running, else a browser that is playing. A browser playing
/// a video never wins over a call app that is quiet for a moment.
pub fn pick_meeting_app(
    running: &[crate::system_audio_tap::RunningApp],
    remembered: Option<&str>,
) -> Option<String> {
    let rank = |bundle: &str| MEETING_APPS.iter().position(|known| *known == bundle);
    let best = |playing_only: bool, ranks: std::ops::Range<usize>| {
        running
            .iter()
            .filter(|app| !playing_only || app.playing)
            .filter_map(|app| rank(&app.bundle_id).map(|r| (r, app)))
            .filter(|(r, _)| ranks.contains(r))
            .min_by_key(|(r, _)| *r)
            .map(|(_, app)| app.bundle_id.clone())
    };
    best(true, 0..FIRST_BROWSER)
        .or_else(|| best(false, 0..FIRST_BROWSER))
        .or_else(|| {
            remembered
                .filter(|id| running.iter().any(|app| app.bundle_id == *id))
                .map(str::to_string)
        })
        .or_else(|| best(true, FIRST_BROWSER..MEETING_APPS.len()))
}

// SE-MEET-002
/// The call app holding the microphone now, if one does. Sound alone (a
/// video playing) is not a call. Browsers are left out here: one holding the
/// microphone may be on any site (see [`browser_on_microphone`]).
pub fn call_on_microphone(processes: &[crate::system_audio_tap::AudioProcess]) -> Option<String> {
    on_microphone(processes, 0..FIRST_BROWSER)
}

/// A browser holding the microphone: a call only when its front tab is
/// Google Meet ([`is_meet_title`]).
pub fn browser_on_microphone(
    processes: &[crate::system_audio_tap::AudioProcess],
) -> Option<String> {
    on_microphone(processes, FIRST_BROWSER..MEETING_APPS.len())
}

// SE-MEET-002
/// Whether a browser window's title (its front tab, read through
/// Accessibility) is a Google Meet call: Meet titles a call's tab
/// "Meet - <code>" (or with an en dash). Its landing page ("Google Meet") is
/// not a call, nor is a page that only names Meet.
pub fn is_meet_title(title: &str) -> bool {
    let title = title.trim_start();
    title.starts_with("Meet - ") || title.starts_with("Meet \u{2013} ")
}

fn on_microphone(
    processes: &[crate::system_audio_tap::AudioProcess],
    ranks: std::ops::Range<usize>,
) -> Option<String> {
    let rank = |bundle: &str| {
        MEETING_APPS[ranks.clone()]
            .iter()
            .position(|known| *known == bundle)
    };
    processes
        .iter()
        .filter(|process| process.recording)
        .filter_map(|process| {
            [&process.app_bundle_id, &process.bundle_id]
                .into_iter()
                .find_map(|id| rank(id).map(|r| (r, id)))
        })
        .min_by_key(|(r, _)| *r)
        .map(|(_, id)| id.clone())
}

/// The name the question uses for a call app ("Zoom", not "zoom.us");
/// `None` for an app it does not know (the bar then says "a call app").
pub fn call_app_name(bundle_id: &str) -> Option<&'static str> {
    Some(match bundle_id {
        "us.zoom.xos" => "Zoom",
        "com.microsoft.teams2" | "com.microsoft.teams" => "Microsoft Teams",
        "com.vng.zalo" => "Zalo",
        "com.facebook.archon" => "Messenger",
        "com.apple.FaceTime" => "FaceTime",
        "com.tinyspeck.slackmacgap" => "Slack",
        "com.hnc.Discord" => "Discord",
        // A browser is asked about only for a Meet call.
        id if MEETING_APPS[FIRST_BROWSER..].contains(&id) => "Google Meet",
        _ => return None,
    })
}

/// How often the microphone is looked at, and how many looks in a row
/// without a call app on it end the call (a mute or a device switch can
/// let go of it for a moment).
pub const CALL_POLL: std::time::Duration = std::time::Duration::from_secs(3);
pub const CALL_GAP_POLLS: u32 = 20;

/// What one look at the microphone calls for.
#[derive(Debug, PartialEq)]
pub enum CallStep {
    /// A new call: ask whether to take notes.
    Ask(String),
    /// The call that was asked about is over.
    CallEnded,
    /// The question is switched off (SE-MEET-023): close any open question.
    Silenced,
    Nothing,
}

/// Asks once per call: a call lasts while one call app holds the
/// microphone, short gaps included.
#[derive(Default)]
pub struct CallWatch {
    call: Option<String>,
    gap: u32,
}

impl CallWatch {
    /// `busy`: a meeting is recording or being finished; a call that starts
    /// then counts as seen, so its end of recording does not ask.
    pub fn see(&mut self, holder: Option<String>, busy: bool) -> CallStep {
        let Some(app) = holder else {
            if self.call.is_none() {
                return CallStep::Nothing;
            }
            self.gap += 1;
            if self.gap < CALL_GAP_POLLS {
                return CallStep::Nothing;
            }
            self.call = None;
            self.gap = 0;
            return CallStep::CallEnded;
        };
        self.gap = 0;
        if self.call.as_deref() == Some(app.as_str()) {
            return CallStep::Nothing;
        }
        self.call = Some(app.clone());
        if busy {
            CallStep::Nothing
        } else {
            CallStep::Ask(app)
        }
    }

    // SE-MEET-023
    /// One poll with the "Ask when a call starts" switch: while it is off a
    /// call counts as seen (as when `busy`), so switching it on during that
    /// call does not ask about it, and any open question closes. A call's
    /// end still reads as [`CallStep::CallEnded`].
    pub fn look(&mut self, holder: Option<String>, busy: bool, ask_on_call: bool) -> CallStep {
        match self.see(holder, busy || !ask_on_call) {
            CallStep::Nothing if !ask_on_call => CallStep::Silenced,
            step => step,
        }
    }
}

/// The app to record after the user answered the question about `asked`:
/// nothing records without a yes.
pub fn app_to_record(yes: bool, asked: Option<String>) -> Option<String> {
    asked.filter(|_| yes)
}

// SE-MEET-021
/// The source a start records when it closes the question about `asked`:
/// Automatic means the app asked about, as a Yes does; the microphone only
/// or a named app stays what the user picked. With no question, unchanged.
pub fn source_when_asked(source: MeetingSource, asked: Option<String>) -> MeetingSource {
    match (source, asked) {
        (MeetingSource::Automatic, Some(bundle_id)) => MeetingSource::App(bundle_id),
        (source, _) => source,
    }
}

// SE-MEET-002, SE-MEET-021
/// What the meeting bar shows, the call it asks about, and whether a start
/// is claiming the session: one value under one lock, so each step below is
/// a single critical section and a question and a start never interleave.
/// Kept true by every step: `asked` is set exactly while the phase is
/// "asking", and no question opens while `claimed`.
pub struct Bar {
    shown: Option<MeetingState>,
    asked: Option<String>,
    /// A start has closed any question and is on its way to recording (or
    /// to its error); held until [`Bar::started`] or [`Bar::failed`].
    claimed: bool,
    /// Counts claims, so a start lets go only of its own.
    claim_id: u64,
}

impl Default for Bar {
    fn default() -> Self {
        Self::new()
    }
}

impl Bar {
    pub const fn new() -> Self {
        Bar {
            shown: None,
            asked: None,
            claimed: false,
            claim_id: 0,
        }
    }

    /// The state the bar shows now ("idle" before anything was shown).
    pub fn now(&self) -> MeetingState {
        self.shown.clone().unwrap_or_else(|| MeetingState {
            phase: "idle".to_string(),
            ..MeetingState::default()
        })
    }

    /// Shows `state`; leaving "asking" this way forgets the asked app.
    pub fn set(&mut self, state: MeetingState) {
        if state.phase != "asking" {
            self.asked = None;
        }
        self.shown = Some(state);
    }

    /// The watcher's question about `bundle_id`: opens only on an idle bar
    /// with no open error and no start claiming the session, and remembers
    /// the app in the same step. Returns the state to show.
    pub fn ask(&mut self, bundle_id: String, app_name: Option<String>) -> Option<MeetingState> {
        let now = self.now();
        if self.claimed || now.phase != "idle" || now.error.is_some() {
            return None;
        }
        let state = MeetingState {
            phase: "asking".to_string(),
            app_name,
            ..MeetingState::default()
        };
        self.asked = Some(bundle_id);
        self.shown = Some(state.clone());
        Some(state)
    }

    /// Closes the question if one is open, returning the app it asked
    /// about; with no question open it takes nothing and changes nothing.
    pub fn end_ask(&mut self) -> Option<String> {
        if self.now().phase != "asking" {
            return None;
        }
        let asked = self.asked.take();
        self.set(MeetingState {
            phase: "idle".to_string(),
            ..MeetingState::default()
        });
        asked
    }

    /// A start (the page, the shortcut, the tray) claims the session: it
    /// closes an open question in the same step (Automatic then records the
    /// asked app) and keeps the watcher from asking until it ends. Refused
    /// only while another start is claiming.
    pub fn claim(&mut self, source: MeetingSource) -> Result<MeetingSource, String> {
        if self.claimed {
            return Err("running: a meeting is already recording".to_string());
        }
        let source = source_when_asked(source, self.end_ask());
        self.take_claim();
        Ok(source)
    }

    /// The user's answer on the bar, in one step: closes the question; a
    /// Yes also claims the session for the app asked about, so no other
    /// question can open (and be closed) before its start.
    pub fn answer(&mut self, yes: bool) -> Option<String> {
        // No question is open while a start claims (ask refuses then).
        if self.claimed {
            return None;
        }
        let app = app_to_record(yes, self.end_ask())?;
        self.take_claim();
        Some(app)
    }

    fn take_claim(&mut self) {
        self.claimed = true;
        self.claim_id = self.claim_id.wrapping_add(1);
    }

    /// The claim taken last (by [`Bar::claim`] or a Yes).
    pub fn claim_id(&self) -> u64 {
        self.claim_id
    }

    /// Whether a call that starts now counts as seen without a question: a
    /// meeting is recording, being finished, or a start is on its way.
    pub fn busy(&self) -> bool {
        self.claimed || !matches!(self.now().phase.as_str(), "idle" | "asking")
    }

    /// The bar's × on an idle bar: clears its error; on any other phase
    /// (a question that opened meanwhile included) changes nothing.
    pub fn clear_error(&mut self) -> Option<MeetingState> {
        let now = self.now();
        if now.phase != "idle" {
            return None;
        }
        let state = MeetingState { error: None, ..now };
        self.set(state.clone());
        Some(state)
    }

    /// Lets claim `id` go without showing anything (a start that
    /// panicked); a newer start's claim is left alone.
    pub fn release(&mut self, id: u64) {
        if self.claim_id == id {
            self.claimed = false;
        }
    }

    /// The claimed start is recording: shows it and lets the claim go.
    pub fn started(&mut self, state: MeetingState) {
        self.set(state);
        self.claimed = false;
    }

    /// The claimed start failed: lets the claim go and, unless a meeting is
    /// still recording or being finished, shows the error on an idle bar.
    pub fn failed(&mut self, error: String, recording: bool) -> Option<MeetingState> {
        self.claimed = false;
        if recording || self.now().phase != "idle" {
            return None;
        }
        let state = MeetingState {
            phase: "idle".to_string(),
            error: Some(error),
            ..MeetingState::default()
        };
        self.set(state.clone());
        Some(state)
    }
}

/// Why a start that reached the recording step is refused, if it is: a
/// meeting still recording, or one being transcribed or noted.
pub fn start_refused(running: bool, phase: &str) -> Option<String> {
    (running || phase != "idle").then(|| "running: a meeting is already recording".to_string())
}

/// Where a meeting stands, for the meeting bar and the window.
#[derive(Debug, Clone, Default, Serialize, Type)]
pub struct MeetingState {
    /// "idle", "asking" (a call started: take notes?), "recording",
    /// "transcribing" or "notes".
    pub phase: String,
    /// Unix time the recording started.
    pub started_at: Option<i64>,
    pub app_name: Option<String>,
    pub error: Option<String>,
    /// The History entry of the meeting being finished or last finished.
    pub history_id: Option<i64>,
}

pub mod session {
    //! One meeting at a time: start, stop, and the work after the stop.

    use super::*;
    use crate::audio_toolkit::audio::FrameResampler;
    use crate::audio_toolkit::vad::{SileroVad, VoiceActivityDetector};
    use crate::audio_toolkit::{AudioRecorder, VadPolicy};
    use crate::managers::history::HistoryManager;
    use crate::managers::transcription::TranscriptionManager;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::{AppHandle, Emitter, Manager};

    struct Running {
        stop: Arc<AtomicBool>,
    }

    static RUNNING: Mutex<Option<Running>> = Mutex::new(None);
    /// The bar, the call it asks about and a start's claim, under one lock.
    /// Lock order: RUNNING before STATE (try_start holds RUNNING while it
    /// reads the phase); nothing takes RUNNING while holding STATE.
    static STATE: Mutex<Bar> = Mutex::new(Bar::new());

    /// The event the meeting bar and the window listen to.
    pub const STATE_EVENT: &str = "meeting-state";

    /// The meeting's state now.
    pub fn state() -> MeetingState {
        lock_bar().now()
    }

    /// The bar, also after a panic elsewhere held its lock (each step
    /// leaves it whole).
    fn lock_bar() -> std::sync::MutexGuard<'static, Bar> {
        STATE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// One step on the bar, under its lock (never fails: see [`lock_bar`]).
    fn with_bar<T>(step: impl FnOnce(&mut Bar) -> T) -> T {
        step(&mut lock_bar())
    }

    /// Held by a start from the moment it takes its claim: a panic before
    /// the start records or fails (in `show`, `try_start`, …) must not keep
    /// the claim (no start or question would work until relaunch). It lets
    /// go of claim `.0` only, so a newer start's claim is left alone. It
    /// does not clear RUNNING: a panic after RUNNING is set still leaves
    /// "running" until relaunch, as before.
    struct ReleaseOnPanic(u64);

    impl Drop for ReleaseOnPanic {
        fn drop(&mut self) {
            if std::thread::panicking() {
                let id = self.0;
                with_bar(|bar| bar.release(id));
            }
        }
    }

    /// Whether a meeting is recording now.
    pub fn is_recording() -> bool {
        RUNNING.lock().is_ok_and(|r| r.is_some())
    }

    fn announce(app: &AppHandle, state: MeetingState) {
        with_bar(|bar| bar.set(state.clone()));
        show(app, &state);
    }

    fn show(app: &AppHandle, state: &MeetingState) {
        let _ = app.emit(STATE_EVENT, state);
        crate::meeting_window::follow(app, state);
        crate::tray::update_tray_menu(app);
    }

    // SE-MEET-001, SE-MEET-020
    /// Starts recording a meeting from `source`: an app's sound as "Others"
    /// with the microphone as "Me", or the microphone alone. Never starts a
    /// dictation. A start that fails shows why on the meeting bar, with its ×.
    /// A start while the bar asks about a call closes that question in the
    /// same step that claims the session (SE-MEET-021, [`Bar::claim`]): the
    /// Meetings page's Start is then an answer, like the shortcut, and no
    /// question opens until the start records or fails, so a question never
    /// makes it "running".
    pub fn start(app: &AppHandle, source: MeetingSource) -> Result<(), String> {
        let (claimed, closed) = with_bar(|bar| {
            let asking = bar.now().phase == "asking";
            let claimed = bar.claim(source).map(|source| (source, bar.claim_id()));
            let closed = (asking && claimed.is_ok()).then(|| bar.now());
            (claimed, closed)
        });
        // Refused only while another start is claiming: that start shows
        // its own outcome on the bar.
        let (source, claim) = claimed.inspect_err(|e| log::warn!("Meeting: {e}"))?;
        // Armed before anything that can panic while the claim is held.
        let _guard = ReleaseOnPanic(claim);
        if let Some(state) = closed {
            show(app, &state);
        }
        start_claimed(app, source)
    }

    /// Runs a start that holds the claim, and lets the claim go: on success
    /// with "recording", on failure with the error on an idle bar, with
    /// its × (a meeting still recording or being finished keeps its bar).
    /// The caller holds a [`ReleaseOnPanic`] for its claim.
    fn start_claimed(app: &AppHandle, source: MeetingSource) -> Result<(), String> {
        try_start(app, source).inspect_err(|e| {
            log::warn!("Meeting: {e}");
            let recording = is_recording();
            if let Some(state) = with_bar(|bar| bar.failed(e.clone(), recording)) {
                show(app, &state);
            }
        })
    }

    fn try_start(app: &AppHandle, source: MeetingSource) -> Result<(), String> {
        // SE-MEET-003: hidden without the process tap (macOS 14.2+), also
        // for the microphone only (owner 11/11: unchanged below 14.2).
        if !crate::system_audio_tap::available() {
            return Err("unsupported: meeting notes need macOS 14.2".to_string());
        }
        let settings = crate::settings::get_settings(app);
        let running_apps = crate::system_audio_tap::list_apps();
        // SE-MEET-020: None records the microphone only.
        let bundle_id = resolve_source(&source, &running_apps, settings.meeting_app.as_deref())?;
        let app_name = bundle_id.as_ref().map(|bundle_id| {
            running_apps
                .iter()
                .find(|a| a.bundle_id == *bundle_id)
                .map(|a| a.name.clone())
                .unwrap_or_else(|| bundle_id.clone())
        });
        let stop = Arc::new(AtomicBool::new(false));
        {
            let mut running = RUNNING.lock().map_err(|e| e.to_string())?;
            // The last meeting is still being transcribed or noted: its
            // thread owns the bar until it is idle again.
            if let Some(refused) = start_refused(running.is_some(), &state().phase) {
                return Err(refused);
            }
            *running = Some(Running { stop: stop.clone() });
        }
        let (tap, chunks) = match bundle_id
            .as_deref()
            .map(|id| crate::system_audio_tap::start(id, false))
        {
            Some(Ok((tap, chunks))) => (Some(tap), Some(chunks)),
            Some(Err(e)) => {
                clear_running();
                return Err(e);
            }
            None => (None, None),
        };
        // SE-MEET-005: both tracks (or the microphone alone) also feed the
        // live panel.
        let (live, live_samples) = crate::meeting_live::session::feed();
        let mut recorder = match open_microphone(app, live.clone()) {
            Ok(recorder) => recorder,
            Err(e) => {
                clear_running();
                return Err(e);
            }
        };
        // Read again: opening the microphone can take seconds, and a change
        // made meanwhile must not be written over.
        // A microphone-only meeting leaves the remembered app as it was.
        let mut settings = crate::settings::get_settings(app);
        let live_level = settings.meeting_live_level;
        if let Some(bundle_id) = &bundle_id {
            settings.meeting_app = Some(bundle_id.clone());
            crate::settings::write_settings(app, settings);
        }

        let started = Instant::now();
        let started_at = chrono::Utc::now().timestamp();
        crate::meeting_live::session::begin(
            app,
            started,
            live_level,
            live_samples,
            bundle_id.is_none(),
        );
        let recording = MeetingState {
            phase: "recording".to_string(),
            started_at: Some(started_at),
            app_name: app_name.clone(),
            ..MeetingState::default()
        };
        with_bar(|bar| bar.started(recording.clone()));
        show(app, &recording);
        match &bundle_id {
            Some(bundle_id) => log::info!("Meeting: recording {bundle_id} and the microphone"),
            None => log::info!("Meeting: recording the microphone only"),
        }

        let app = app.clone();
        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let recording = record(&app, &stop, started, chunks, &live);
                drop(tap);
                crate::meeting_live::session::end(&app);
                let me = recorder.stop().unwrap_or_default();
                let _ = recorder.close();
                clear_running();
                let duration_ms = started.elapsed().as_millis() as i64;
                finish(
                    &app,
                    Finished {
                        me,
                        others: recording.others,
                        dictations: recording.dictations,
                        app_name,
                        started_at,
                        duration_ms,
                    },
                )
            }));
            clear_running();
            let error = match result {
                Ok(Ok(_)) => None,
                Ok(Err(e)) => Some(e),
                Err(_) => Some("failed: unexpected".to_string()),
            };
            if let Some(e) = &error {
                log::error!("Meeting: {e}");
            }
            let mut state = state();
            state.phase = "idle".to_string();
            state.started_at = None;
            state.error = error;
            announce(&app, state);
        });
        Ok(())
    }

    fn clear_running() {
        if let Ok(mut running) = RUNNING.lock() {
            *running = None;
        }
    }

    /// Ends the recording; transcription and notes go on in the background.
    pub fn stop() {
        if let Ok(running) = RUNNING.lock() {
            if let Some(running) = running.as_ref() {
                running.stop.store(true, Ordering::Relaxed);
            }
        }
    }

    /// The bar's ×: clears a finished meeting's error; while a meeting is
    /// being finished it only hides the bar (the work goes on, and the next
    /// step shows it again). A recording meeting keeps its bar.
    pub fn dismiss(app: &AppHandle) {
        let now = state();
        match now.phase.as_str() {
            "idle" => {
                if let Some(state) = with_bar(Bar::clear_error) {
                    show(app, &state);
                }
            }
            "asking" => {
                end_ask(app);
            }
            "recording" => {}
            _ => crate::meeting_window::hide(app),
        }
    }

    // SE-MEET-002
    /// Puts the question on the meeting bar: "<app> is using the microphone.
    /// Take notes of this call?" Nothing records until [`answer`]. Never over
    /// a meeting, an error the user has not closed, or a start on its way:
    /// the app and the question are stored in one step ([`Bar::ask`]).
    fn ask(app: &AppHandle, bundle_id: String) {
        // RUNNING alone, before STATE (see STATE).
        if is_recording() {
            return;
        }
        let app_name = call_app_name(&bundle_id).map(str::to_string);
        if let Some(state) = with_bar(|bar| bar.ask(bundle_id, app_name)) {
            show(app, &state);
        }
    }

    /// Takes the question off the bar if it is still there, and returns the
    /// app it asked about.
    fn end_ask(app: &AppHandle) -> Option<String> {
        let (asked, state) = with_bar(|bar| bar.end_ask().map(|asked| (asked, bar.now())))?;
        show(app, &state);
        Some(asked)
    }

    // SE-MEET-002
    /// The user's answer on the bar: Yes records the app asked about; No
    /// only closes the question (this call is not asked about again). The
    /// question is closed once, in the same step that claims the start.
    pub fn answer(app: &AppHandle, yes: bool) -> Result<(), String> {
        let (record, closed) = with_bar(|bar| {
            let asking = bar.now().phase == "asking";
            let record = bar.answer(yes).map(|id| (id, bar.claim_id()));
            (record, asking.then(|| bar.now()))
        });
        // Armed before anything that can panic while a Yes holds its claim.
        let _guard = record.as_ref().map(|(_, claim)| ReleaseOnPanic(*claim));
        if let Some(state) = closed {
            show(app, &state);
        }
        match record {
            Some((bundle_id, _)) => start_claimed(app, MeetingSource::App(bundle_id)),
            None => Ok(()),
        }
    }

    /// Looks at the microphone every [`CALL_POLL`] while meeting notes are
    /// on, and asks once when a call app starts holding it, unless "Ask when
    /// a call starts" is off (SE-MEET-023).
    pub fn watch_calls(app: AppHandle) {
        std::thread::spawn(move || {
            let mut watch = CallWatch::default();
            loop {
                std::thread::sleep(CALL_POLL);
                if !crate::settings::meeting_notes_on() {
                    watch = CallWatch::default();
                    end_ask(&app);
                    continue;
                }
                let processes = crate::system_audio_tap::list_processes();
                let holder = call_on_microphone(&processes).or_else(|| {
                    browser_on_microphone(&processes).filter(|browser| {
                        is_meet_title(&crate::system_audio_tap::app_context(browser).window_title)
                    })
                });
                // A settings read that panics must not end the watcher for
                // good: that look then asks as by default.
                let ask_on_call = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    crate::settings::get_settings(&app).meeting_ask_on_call
                }))
                .unwrap_or(true);
                // RUNNING, then STATE: never nested.
                let busy = is_recording() || lock_bar().busy();
                match watch.look(holder, busy, ask_on_call) {
                    CallStep::Ask(bundle_id) => ask(&app, bundle_id),
                    CallStep::CallEnded | CallStep::Silenced => {
                        end_ask(&app);
                    }
                    CallStep::Nothing => {}
                }
            }
        });
    }

    /// Stops a recording meeting, or starts one with the app found running.
    /// Returns the error a start ran into.
    pub fn toggle(app: &AppHandle) -> Result<(), String> {
        if state().phase == "asking" {
            // The shortcut or the tray while asked: the same as Yes.
            answer(app, true)
        } else if is_recording() {
            stop();
            Ok(())
        } else if state().phase != "idle" {
            // Still finishing the last meeting: show its progress again (the
            // bar may have been closed with ×).
            crate::meeting_window::follow(app, &state());
            Ok(())
        } else {
            // SE-MEET-020: the shortcut and the tray start on Automatic.
            start(app, MeetingSource::Automatic)
        }
    }

    /// The microphone the user picked for dictation, as a second stream of
    /// its own (CoreAudio lets both read the same device), with no VAD so
    /// the whole meeting is kept.
    fn open_microphone(
        app: &AppHandle,
        live: crate::meeting_live::session::Feed,
    ) -> Result<AudioRecorder, String> {
        let device = app
            .try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
            .and_then(|audio| audio.meeting_microphone());
        // Only forwards (an unbounded channel): capture never waits on the
        // live panel.
        let mut recorder = AudioRecorder::new()
            .map_err(|e| format!("microphone: {e}"))?
            .with_audio_callback(move |frame| {
                let _ = live.send((true, frame.to_vec()));
            });
        recorder
            .open(device)
            .map_err(|e| format!("microphone: {e}"))?;
        let ready = recorder
            .start(VadPolicy::Disabled)
            .map_err(|e| format!("microphone: {e}"))?;
        // Wait for the first samples so the two tracks share a start.
        let _ = ready.recv_timeout(Duration::from_secs(3));
        Ok(recorder)
    }

    struct Recording {
        others: Vec<f32>,
        dictations: Vec<(u64, u64)>,
    }

    /// Reads the app's sound until stopped, and notes when a dictation runs.
    /// With no app (`chunks` None, the microphone only) it only waits for
    /// the stop and [`TAIL`], so the microphone keeps the last second too.
    fn record(
        app: &AppHandle,
        stop: &AtomicBool,
        started: Instant,
        chunks: Option<std::sync::mpsc::Receiver<crate::system_audio_tap::TapChunk>>,
        live: &crate::meeting_live::session::Feed,
    ) -> Recording {
        let mut others: Vec<f32> = Vec::new();
        let mut resampler: Option<(f64, FrameResampler)> = None;
        let mut dictations: Vec<(u64, u64)> = Vec::new();
        let mut dictating_since: Option<u64> = None;
        let audio = app
            .try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
            .map(|s| s.inner().clone());
        // SE-MEET-006: after the stop, sound already on its way (the last
        // second) is still read, until the tap goes quiet or TAIL has passed.
        let mut stopped_at: Option<Instant> = None;
        loop {
            if stopped_at.is_none() && stop.load(Ordering::Relaxed) {
                stopped_at = Some(Instant::now());
            }
            if stopped_at.is_some_and(|at| at.elapsed() > TAIL) {
                break;
            }
            let now_ms = started.elapsed().as_millis() as u64;
            // SE-MEET-001: a dictation during the meeting is marked.
            let dictating = audio.as_ref().is_some_and(|a| a.is_recording());
            match (dictating, dictating_since) {
                (true, None) => dictating_since = Some(now_ms),
                (false, Some(from)) => {
                    dictations.push((from, now_ms));
                    dictating_since = None;
                }
                _ => {}
            }
            let Some(chunks) = chunks.as_ref() else {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            };
            let chunk = match chunks.recv_timeout(Duration::from_millis(100)) {
                Ok(chunk) => chunk,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) if stopped_at.is_none() => continue,
                Err(_) => break,
            };
            // A new resampler when the app's sample rate changes.
            if resampler.as_ref().map(|(rate, _)| *rate) != Some(chunk.sample_rate) {
                resampler = None;
            }
            let (_, rs) = resampler.get_or_insert_with(|| {
                (
                    chunk.sample_rate,
                    FrameResampler::new(
                        chunk.sample_rate as usize,
                        RATE,
                        Duration::from_millis(FRAME_MS),
                    ),
                )
            });
            let mut resampled = Vec::new();
            rs.push(&chunk.samples, |frame| resampled.extend_from_slice(frame));
            let end = chunk
                .arrived
                .saturating_duration_since(started)
                .as_secs_f64();
            let _ = live.send((false, resampled.clone()));
            place_chunk(&mut others, &resampled, (end * RATE as f64) as usize);
        }
        if let Some(from) = dictating_since {
            dictations.push((from, started.elapsed().as_millis() as u64));
        }
        Recording { others, dictations }
    }

    struct Finished {
        me: Vec<f32>,
        others: Vec<f32>,
        dictations: Vec<(u64, u64)>,
        /// The recorded app's name; None for the microphone only.
        app_name: Option<String>,
        started_at: i64,
        duration_ms: i64,
    }

    fn set_phase(app: &AppHandle, phase: &str, history_id: Option<i64>) {
        let mut state = state();
        state.phase = phase.to_string();
        if history_id.is_some() {
            state.history_id = history_id;
        }
        announce(app, state);
    }

    // SE-MEET-006, SE-MEET-020
    /// After the stop: recognise the tracks with the selected (accurate)
    /// model, save the meeting, then write its notes. Whether there are
    /// speaker labels follows the source (an app recorded or not), never
    /// whether a track happens to be silent.
    fn finish(app: &AppHandle, done: Finished) -> Result<(), String> {
        set_phase(app, "transcribing", None);
        let speaker_labels = done.app_name.is_some();
        let text = transcribe_tracks(
            app,
            &done.me,
            &done.others,
            &done.dictations,
            speaker_labels,
        )?;
        let history = app.state::<Arc<HistoryManager>>().inner().clone();
        let file_name = format!("file-meeting-{}.wav", done.started_at);
        let wav = history.recordings_dir().join(&file_name);
        let mixed = mix(&done.me, speaker_labels.then_some(done.others.as_slice()));
        if let Err(e) = crate::audio_toolkit::save_wav_file(&wav, &mixed) {
            log::warn!("Meeting: cannot keep the audio: {e}");
        }
        let when = chrono::DateTime::from_timestamp(done.started_at, 0)
            .map(|t| {
                t.with_timezone(&chrono::Local)
                    .format("%d/%m %H:%M")
                    .to_string()
            })
            .unwrap_or_default();
        let settings = crate::settings::get_settings(app);
        let saved = saved_as(
            done.app_name.as_deref(),
            &when,
            &labels(&settings.app_language),
        );
        let entry = history
            .save_titled_entry(file_name, saved.title, text.clone())
            .map_err(|e| e.to_string())?;
        history
            .save_meeting(entry.id, &saved.row_app, done.started_at, done.duration_ms)
            .map_err(|e| e.to_string())?;
        set_phase(app, "notes", Some(entry.id));
        write_notes_for(
            app,
            &history,
            entry.id,
            &text,
            saved.guess_app.as_deref(),
            None,
        );
        Ok(())
    }

    /// The tracks as one transcript, recognised span by span with the
    /// selected model; labelled Me / Others when `speaker_labels`, else
    /// the microphone's lines without labels (SE-MEET-020). An empty
    /// transcript is still a meeting: its notes say so (SE-MEET-009).
    fn transcribe_tracks(
        app: &AppHandle,
        me: &[f32],
        others: &[f32],
        dictations: &[(u64, u64)],
        speaker_labels: bool,
    ) -> Result<String, String> {
        let settings = crate::settings::get_settings(app);
        let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();
        let model_id = settings.selected_model.clone();
        if model_id.is_empty() {
            return Err("no-model: no recognition model is selected".to_string());
        }
        let vad_path = app
            .path()
            .resolve(
                "resources/models/silero_vad_v4.onnx",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| format!("vad: {e}"))?;
        let mut turns = Vec::new();
        for (speaker, samples) in [(Speaker::Me, me), (Speaker::Others, others)] {
            let mut vad = SileroVad::new(&vad_path, 0.5).map_err(|e| format!("vad: {e}"))?;
            let spans = speech_spans(samples, |frame| vad.is_voice(frame).unwrap_or(false));
            for span in spans {
                if !tm.is_model_loaded() {
                    tm.load_model_with_device(&model_id, None)
                        .map_err(|e| format!("no-model: {e}"))?;
                }
                let text = tm.transcribe(span.samples).map_err(|e| e.to_string())?;
                let dictation = speaker == Speaker::Me
                    && during_dictation(span.start_ms, span.end_ms, dictations);
                turns.push(Turn {
                    start_ms: span.start_ms,
                    end_ms: span.end_ms,
                    speaker,
                    text,
                    dictation,
                });
            }
        }
        let turns = drop_echo(turns);
        Ok(transcript(
            &turns,
            &labels(&settings.app_language),
            speaker_labels,
        ))
    }

    /// `handy --meeting-probe <bundle id | pid>`: taps one app for `seconds`
    /// (muted when asked) with no microphone, and returns the transcript the
    /// meeting would get. Saves nothing to History.
    pub fn probe(
        app: &AppHandle,
        target: &str,
        seconds: u64,
        mute: bool,
    ) -> Result<String, String> {
        let (tap, chunks) = crate::system_audio_tap::start(target, mute)?;
        let stop = Arc::new(AtomicBool::new(false));
        let timer = stop.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(seconds));
            timer.store(true, Ordering::Relaxed);
        });
        let started = Instant::now();
        // The live panel at level 2, so its lines can be measured too.
        let (live, live_samples) = crate::meeting_live::session::feed();
        crate::meeting_live::session::begin(app, started, 2, live_samples, false);
        let recording = record(app, &stop, started, Some(chunks), &live);
        drop(tap);
        drop(live);
        // Lines still being recognised.
        std::thread::sleep(Duration::from_secs(3));
        let lines = crate::meeting_live::session::view().lines;
        crate::meeting_live::session::end(app);
        eprintln!("live lines: {}", lines.len());
        for line in &lines {
            eprintln!("live {:>6.1}s {}", line.at_ms as f64 / 1000.0, line.text);
        }
        log::info!(
            "Meeting probe: {:.1} s of app sound",
            recording.others.len() as f64 / RATE as f64
        );
        transcribe_tracks(app, &[], &recording.others, &recording.dictations, true)
    }

    // SE-MEET-008, SE-MEET-019
    /// "Take meeting notes" on a file brought in from Files or a link, while
    /// meeting notes are on: the entry is listed on the Meetings page under
    /// its title, with no speaker labels and its text as it is, and its notes
    /// are written in the background with the template AI guesses from the
    /// transcript alone (there is no app to go on). Only on the user's ask
    /// (SE-FILE-002). Errors: "off", "missing: …", "exists".
    pub async fn note_file(app: &AppHandle, history_id: i64) -> Result<(), String> {
        if !crate::settings::meeting_notes_on() {
            return Err("off: meeting notes are off".to_string());
        }
        let history = app.state::<Arc<HistoryManager>>().inner().clone();
        if history
            .get_meeting(history_id)
            .map_err(|e| e.to_string())?
            .is_some()
        {
            return Err("exists: already a meeting".to_string());
        }
        let entry = history
            .get_entry_by_id(history_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "missing: no such entry".to_string())?;
        let duration_ms = hound::WavReader::open(history.get_audio_file_path(&entry.file_name))
            .map(|wav| wav.duration() as i64 * 1000 / i64::from(wav.spec().sample_rate.max(1)))
            .unwrap_or_else(|e| {
                log::warn!("Meeting notes: no audio kept for the file, so no length: {e}");
                0
            });
        history
            .save_meeting(history_id, &entry.title, entry.timestamp, duration_ms)
            .map_err(|e| e.to_string())?;
        let _ = app.emit(NOTES_EVENT, history_id);
        let app = app.clone();
        std::thread::spawn(move || {
            write_notes_for(
                &app,
                &history,
                history_id,
                &entry.transcription_text,
                None,
                None,
            );
        });
        Ok(())
    }

    // SE-MEET-009, SE-MEET-012
    /// Writes a meeting's notes with the engine this Mac has and stores them;
    /// `kind` None lets the AI pick the template.
    pub fn write_notes_for(
        app: &AppHandle,
        history: &HistoryManager,
        history_id: i64,
        transcript: &str,
        app_name: Option<&str>,
        kind: Option<crate::meeting_notes::NoteKind>,
    ) {
        let stored = notes_for(app, transcript, app_name, kind);
        if let Err(e) = history.set_meeting_notes(
            history_id,
            stored.kind,
            stored.text.as_deref(),
            &stored.state,
            stored.engine.as_deref(),
        ) {
            log::error!("Meeting notes: cannot save: {e}");
        }
        let _ = app.emit(NOTES_EVENT, history_id);
    }

    /// The event the Meetings page listens to when a meeting's notes change.
    pub const NOTES_EVENT: &str = "meeting-notes-updated";

    /// Sent when a template switch could not write new notes; notes the user
    /// had stay.
    pub const REWRITE_FAILED_EVENT: &str = "meeting-notes-rewrite-failed";

    /// What a template switch does with its result.
    #[derive(Debug, PartialEq)]
    pub(crate) struct RewriteOutcome {
        /// The result replaces what is stored.
        pub store: bool,
        /// The page is told the switch wrote no notes (REWRITE_FAILED_EVENT).
        pub notify: bool,
    }

    // SE-MEET-010
    /// A template switch's result (`state`, `None` when the entry went):
    /// new notes (or an empty meeting's one line) are stored; a failure or "no
    /// AI" keeps the notes the user has. A meeting without notes has nothing
    /// to keep, so it stores why there are none now; when that is still "no
    /// AI", its reason line says so and no toast is sent.
    pub(crate) fn rewrite_outcome(had_notes: bool, state: Option<&str>) -> RewriteOutcome {
        let Some(state) = state else {
            return RewriteOutcome {
                store: false,
                notify: true,
            };
        };
        let wrote = matches!(state, "done" | "empty");
        RewriteOutcome {
            store: wrote || !had_notes,
            notify: !wrote && (had_notes || !state.starts_with("no_ai:")),
        }
    }

    /// What is stored for a meeting's notes (`meetings` row).
    struct StoredNotes {
        kind: Option<&'static str>,
        text: Option<String>,
        /// "empty", "no_ai:<reason>", "done" or "failed".
        state: String,
        engine: Option<String>,
    }

    fn notes_for(
        app: &AppHandle,
        transcript: &str,
        app_name: Option<&str>,
        kind: Option<crate::meeting_notes::NoteKind>,
    ) -> StoredNotes {
        use crate::meeting_notes as notes;
        if !notes::has_substance(transcript) {
            let empty = notes::empty_notes(transcript, kind);
            return StoredNotes {
                kind: Some(empty.kind.id()),
                text: Some(empty.text),
                state: "empty".to_string(),
                engine: None,
            };
        }
        let engine = match notes::engine_for(app) {
            Ok(engine) => engine,
            Err(reason) => {
                return StoredNotes {
                    kind: None,
                    text: None,
                    state: format!("no_ai:{}", no_ai_id(reason)),
                    engine: None,
                }
            }
        };
        let engine_name = engine_label(&engine);
        let ai = notes::EngineAi {
            app: app.clone(),
            engine,
        };
        let result = tauri::async_runtime::block_on(notes::write_notes(
            &ai,
            transcript,
            kind,
            app_name,
            &mut |step| log::debug!("Meeting notes: {step}"),
        ));
        match result {
            Ok(written) => StoredNotes {
                kind: Some(written.kind.id()),
                text: Some(written.text),
                state: "done".to_string(),
                engine: Some(engine_name),
            },
            Err(e) => {
                log::warn!("Meeting notes: {e}");
                StoredNotes {
                    kind: None,
                    text: None,
                    state: "failed".to_string(),
                    engine: Some(engine_name),
                }
            }
        }
    }

    // SE-MEET-010
    /// The Meetings page's template switch: writes the notes again with
    /// `kind`, in the background. Refused while they are being written.
    pub fn rewrite_notes(
        app: &AppHandle,
        history_id: i64,
        kind: crate::meeting_notes::NoteKind,
    ) -> Result<(), String> {
        let history = app.state::<Arc<HistoryManager>>().inner().clone();
        let meeting = history
            .get_meeting(history_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "missing: no such meeting".to_string())?;
        if meeting.notes_state == "writing" {
            return Err("busy: the notes are being written".to_string());
        }
        history
            .set_meeting_notes(
                history_id,
                meeting.kind.as_deref(),
                meeting.notes.as_deref(),
                "writing",
                meeting.notes_engine.as_deref(),
            )
            .map_err(|e| e.to_string())?;
        let _ = app.emit(NOTES_EVENT, history_id);
        let app = app.clone();
        // Off the command's thread: the entry is read and the notes written here.
        std::thread::spawn(move || {
            let stored = match tauri::async_runtime::block_on(history.get_entry_by_id(history_id)) {
                Ok(Some(entry)) => Some(notes_for(
                    &app,
                    &entry.transcription_text,
                    Some(&meeting.app_name),
                    Some(kind),
                )),
                _ => None,
            };
            let outcome = rewrite_outcome(
                meeting.notes.is_some(),
                stored.as_ref().map(|s| s.state.as_str()),
            );
            if outcome.notify {
                let _ = app.emit(REWRITE_FAILED_EVENT, history_id);
            }
            let saved = match stored.filter(|_| outcome.store) {
                Some(stored) => history.set_meeting_notes(
                    history_id,
                    stored.kind,
                    stored.text.as_deref(),
                    &stored.state,
                    stored.engine.as_deref(),
                ),
                // Failed, no AI any more, or the entry went: the notes the
                // user had stay as they were.
                None => history.set_meeting_notes(
                    history_id,
                    meeting.kind.as_deref(),
                    meeting.notes.as_deref(),
                    &meeting.notes_state,
                    meeting.notes_engine.as_deref(),
                ),
            };
            if let Err(e) = saved {
                log::error!("Meeting notes: cannot save: {e}");
            }
            let _ = app.emit(NOTES_EVENT, history_id);
        });
        Ok(())
    }

    pub(crate) fn no_ai_id(reason: crate::meeting_notes::NoAiReason) -> &'static str {
        match reason {
            crate::meeting_notes::NoAiReason::AiOff => "ai_off",
            crate::meeting_notes::NoAiReason::NothingAvailable => "nothing_available",
            crate::meeting_notes::NoAiReason::NotesModelMissing => "notes_model_missing",
        }
    }

    /// Why this Mac has no AI for meetings now ("ai_off",
    /// "nothing_available" or "notes_model_missing"), if it has none.
    pub(crate) fn ai_missing(app: &AppHandle) -> Option<String> {
        crate::meeting_notes::engine_for(app)
            .err()
            .map(|reason| no_ai_id(reason).to_string())
    }

    fn engine_label(engine: &crate::meeting_notes::NotesEngine) -> String {
        match engine {
            crate::meeting_notes::NotesEngine::Apple => "apple".to_string(),
            crate::meeting_notes::NotesEngine::Key { provider, .. } => provider.id.clone(),
            crate::meeting_notes::NotesEngine::OnDevice(_) => {
                crate::meeting_notes::NOTES_LOCAL_MODEL.to_string()
            }
        }
    }
    #[cfg(test)]
    mod tests {
        use super::*;

        // SE-MEET-021. The one test on the session's own STATE: no other
        // test locks it, so the parallel runner cannot interleave here.
        #[test]
        fn a_start_that_panics_while_holding_its_guard_lets_go_of_its_claim_only() {
            let claim = |bar: &mut Bar| {
                bar.claim(MeetingSource::Microphone).expect("claimed");
                bar.claim_id()
            };
            // No panic: the guard's drop keeps the claim (started/failed
            // let it go).
            let first = with_bar(claim);
            drop(ReleaseOnPanic(first));
            assert!(lock_bar().busy());
            with_bar(|bar| bar.release(first));

            // A panic with the guard armed (as in `show` right after the
            // claim) lets this start's claim go.
            let second = with_bar(claim);
            let panicked = std::panic::catch_unwind(|| {
                let _guard = ReleaseOnPanic(second);
                panic!("show panicked");
            });
            assert!(panicked.is_err());
            assert!(!lock_bar().busy());

            // An older start's guard leaves a newer claim alone.
            let third = with_bar(claim);
            let _ = std::panic::catch_unwind(|| {
                let _guard = ReleaseOnPanic(second);
                panic!("older start panicked");
            });
            assert!(lock_bar().busy());
            with_bar(|bar| bar.release(third));
            assert!(!lock_bar().busy());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::system_audio_tap::{AudioProcess, RunningApp};

    // SE-MEET-010
    #[test]
    fn a_failed_template_switch_keeps_the_old_notes() {
        use session::{rewrite_outcome, RewriteOutcome};
        let wrote = RewriteOutcome {
            store: true,
            notify: false,
        };
        let kept = RewriteOutcome {
            store: false,
            notify: true,
        };
        assert_eq!(rewrite_outcome(true, Some("done")), wrote);
        assert_eq!(rewrite_outcome(true, Some("empty")), wrote);
        assert_eq!(rewrite_outcome(true, Some("failed")), kept);
        assert_eq!(rewrite_outcome(true, Some("no_ai:ai_off")), kept);
        assert_eq!(rewrite_outcome(true, Some("no_ai:nothing_available")), kept);
        // The entry went: nothing is stored, the page is told.
        assert_eq!(rewrite_outcome(true, None), kept);
        assert_eq!(rewrite_outcome(false, None), kept);
    }

    // SE-MEET-010/012: a meeting stored with no notes (no AI, or failed) has
    // nothing to keep, so a template switch stores what it got - the notes,
    // or why there are none now - instead of the old reason.
    #[test]
    fn a_template_switch_on_a_meeting_without_notes_stores_what_it_got() {
        use session::{rewrite_outcome, RewriteOutcome};
        let stored = |notify| RewriteOutcome {
            store: true,
            notify,
        };
        assert_eq!(rewrite_outcome(false, Some("done")), stored(false));
        assert_eq!(rewrite_outcome(false, Some("empty")), stored(false));
        assert_eq!(rewrite_outcome(false, Some("failed")), stored(true));
        // Still no AI: the reason line says why, no toast on top.
        assert_eq!(
            rewrite_outcome(false, Some("no_ai:notes_model_missing")),
            stored(false)
        );
    }

    // SE-MEET-012: the ids the interface's lines are keyed by.
    #[test]
    fn each_no_ai_reason_has_the_id_the_interface_reads() {
        use crate::meeting_notes::NoAiReason;
        assert_eq!(session::no_ai_id(NoAiReason::AiOff), "ai_off");
        assert_eq!(
            session::no_ai_id(NoAiReason::NothingAvailable),
            "nothing_available"
        );
        assert_eq!(
            session::no_ai_id(NoAiReason::NotesModelMissing),
            "notes_model_missing"
        );
    }

    // SE-MEET-003
    #[test]
    fn chunks_land_where_they_arrived_and_gaps_become_silence() {
        let mut track = Vec::new();
        place_chunk(&mut track, &[1.0; 10], 10);
        place_chunk(&mut track, &[2.0; 10], 50); // the app was quiet for 30 samples
        assert_eq!(track.len(), 50);
        assert!(track[10..40].iter().all(|s| *s == 0.0));
        assert!(track[40..].iter().all(|s| *s == 2.0));
        place_chunk(&mut track, &[3.0; 10], 45); // early: appended, nothing lost
        assert_eq!(track.len(), 60);
    }

    fn tone(ms: usize) -> Vec<f32> {
        (0..ms * RATE / 1000)
            .map(|i| ((i as f32) * 0.3).sin() * 0.5)
            .collect()
    }

    fn quiet(ms: usize) -> Vec<f32> {
        vec![0.0; ms * RATE / 1000]
    }

    #[test]
    fn spans_follow_speech_and_keep_their_time() {
        let mut track = quiet(2_000);
        track.extend(tone(1_500));
        track.extend(quiet(3_000));
        track.extend(tone(2_000));
        track.extend(quiet(1_000));
        let spans = speech_spans(&track, |frame| frame.iter().any(|s| s.abs() > 0.1));
        assert_eq!(spans.len(), 2);
        // Within a frame or so of the truth (preroll and pause included).
        assert!(
            spans[0].start_ms.abs_diff(2_000) <= 400,
            "{}",
            spans[0].start_ms
        );
        assert!(spans[0].end_ms.abs_diff(3_500) <= 60, "{}", spans[0].end_ms);
        assert!(
            spans[1].start_ms.abs_diff(6_500) <= 400,
            "{}",
            spans[1].start_ms
        );
        assert!(spans[1].end_ms.abs_diff(8_500) <= 60, "{}", spans[1].end_ms);
    }

    // SE-MEET-001
    #[test]
    fn a_turn_mostly_inside_a_dictation_is_marked() {
        let ranges = [(10_000, 14_000)];
        assert!(during_dictation(10_500, 13_500, &ranges));
        assert!(during_dictation(9_000, 13_000, &ranges));
        assert!(!during_dictation(5_000, 11_000, &ranges));
        assert!(!during_dictation(20_000, 21_000, &ranges));
    }

    fn turn(start_ms: u64, speaker: Speaker, text: &str) -> Turn {
        Turn {
            start_ms,
            end_ms: start_ms + 2_000,
            speaker,
            text: text.to_string(),
            dictation: false,
        }
    }

    // SE-MEET-008
    #[test]
    fn the_transcript_interleaves_me_and_others_by_time() {
        let mut dictated = turn(9_000, Speaker::Me, "gửi email cho chị Lan");
        dictated.dictation = true;
        let turns = vec![
            turn(5_000, Speaker::Others, "mình bắt đầu nhé"),
            turn(1_000, Speaker::Me, "alo mọi người"),
            dictated,
            turn(12_000, Speaker::Me, "  "),
        ];
        assert_eq!(
            transcript(&turns, &labels("vi"), true),
            "[Tôi] alo mọi người\n[Người khác] mình bắt đầu nhé\n[Tôi · đọc chính tả] gửi email cho chị Lan"
        );
        assert!(transcript(&turns, &labels("en"), true).starts_with("[Me] alo"));
    }

    // SE-MEET-020
    #[test]
    fn a_one_track_transcript_has_no_labels_and_keeps_dictation_marks() {
        let mut dictated = turn(9_000, Speaker::Me, "gửi email cho chị Lan");
        dictated.dictation = true;
        let turns = vec![
            turn(5_000, Speaker::Me, "mình bắt đầu nhé"),
            turn(1_000, Speaker::Me, "alo mọi người"),
            dictated,
        ];
        assert_eq!(
            transcript(&turns, &labels("vi"), false),
            "alo mọi người\nmình bắt đầu nhé\n[đọc chính tả] gửi email cho chị Lan"
        );
        assert_eq!(
            transcript(&turns, &labels("en"), false),
            "alo mọi người\nmình bắt đầu nhé\n[dictation] gửi email cho chị Lan"
        );
        // The notes' word count skips the dictation mark as it skips a label.
        assert_eq!(
            crate::meeting_notes::substantive_words("[đọc chính tả] một hai"),
            2
        );
    }

    // SE-MEET-020
    #[test]
    fn a_microphone_only_meeting_names_no_app() {
        let mic = saved_as(None, "11/11 09:30", &labels("vi"));
        assert_eq!(mic.title, "Micro · 11/11 09:30");
        assert_eq!(mic.row_app, "");
        assert_eq!(mic.guess_app, None);
        assert_eq!(
            saved_as(None, "11/11 09:30", &labels("en")).title,
            "Microphone · 11/11 09:30"
        );
        let zoom = saved_as(Some("Zoom"), "11/11 09:30", &labels("vi"));
        assert_eq!(zoom.title, "Zoom · 11/11 09:30");
        assert_eq!(zoom.row_app, "Zoom");
        assert_eq!(zoom.guess_app.as_deref(), Some("Zoom"));
    }

    // SE-MEET-020
    #[test]
    fn the_microphone_alone_is_kept_as_recorded() {
        assert_eq!(mix(&[0.4, -0.2], None), vec![0.4, -0.2]);
        // An app track that stayed silent is still a second track.
        assert_eq!(mix(&[0.4, -0.2], Some(&[])), vec![0.2, -0.1]);
    }

    #[test]
    fn the_others_heard_through_the_microphone_are_dropped() {
        let turns = vec![
            turn(1_000, Speaker::Others, "ngân sách quý tư là hai trăm triệu"),
            turn(1_300, Speaker::Me, "ngân sách quý tư là hai trăm triệu"),
            turn(4_000, Speaker::Me, "em đồng ý với ngân sách đó"),
            turn(30_000, Speaker::Me, "ngân sách quý tư là hai trăm triệu"),
        ];
        let kept = drop_echo(turns);
        assert_eq!(kept.len(), 3);
        assert_eq!(kept[1].text, "em đồng ý với ngân sách đó");
        // Said again much later by me: kept.
        assert_eq!(kept[2].start_ms, 30_000);
    }

    #[test]
    fn the_mix_is_as_long_as_the_longer_track() {
        let mixed = mix(&[0.4, 0.4], Some(&[0.2, 0.2, 0.2]));
        assert_eq!(mixed.len(), 3);
        assert!((mixed[0] - 0.3).abs() < 1e-6);
        assert!((mixed[2] - 0.1).abs() < 1e-6);
    }

    fn process(bundle: &str, app: &str, recording: bool) -> AudioProcess {
        AudioProcess {
            pid: 1,
            bundle_id: bundle.to_string(),
            app_bundle_id: app.to_string(),
            playing: true,
            recording,
        }
    }

    // SE-MEET-002
    #[test]
    fn only_a_call_app_holding_the_microphone_is_a_call() {
        // Zoom only playing sound (media) is not a call.
        assert_eq!(
            call_on_microphone(&[process("us.zoom.xos", "", false)]),
            None
        );
        // A call app's helper holding the microphone counts as its app.
        let teams = process("com.microsoft.teams2.helper", "com.microsoft.teams2", true);
        assert_eq!(
            call_on_microphone(&[teams]).as_deref(),
            Some("com.microsoft.teams2")
        );
        // A browser holding the microphone may be any site: never asks.
        let chrome = process("com.google.Chrome.helper", "com.google.Chrome", true);
        assert_eq!(call_on_microphone(&[chrome.clone()]), None);
        // Several on the microphone: the first in the list wins.
        let both = [
            chrome,
            process("com.hnc.Discord", "", true),
            process("us.zoom.xos", "", true),
        ];
        assert_eq!(call_on_microphone(&both).as_deref(), Some("us.zoom.xos"));
    }

    // SE-MEET-002
    #[test]
    fn a_call_is_asked_about_once() {
        let zoom = || Some("us.zoom.xos".to_string());
        let mut watch = CallWatch::default();
        assert_eq!(watch.see(None, false), CallStep::Nothing);
        assert_eq!(
            watch.see(zoom(), false),
            CallStep::Ask("us.zoom.xos".into())
        );
        // The same call keeps the microphone: no second question.
        assert_eq!(watch.see(zoom(), false), CallStep::Nothing);
        // A short gap (muting, a device switch) is the same call.
        for _ in 0..CALL_GAP_POLLS - 1 {
            assert_eq!(watch.see(None, false), CallStep::Nothing);
        }
        assert_eq!(watch.see(zoom(), false), CallStep::Nothing);
        // A long gap ends the call; the next one is asked about again.
        for _ in 0..CALL_GAP_POLLS - 1 {
            assert_eq!(watch.see(None, false), CallStep::Nothing);
        }
        assert_eq!(watch.see(None, false), CallStep::CallEnded);
        assert_eq!(
            watch.see(zoom(), false),
            CallStep::Ask("us.zoom.xos".into())
        );
        // Another app taking the microphone is another call.
        assert_eq!(
            watch.see(Some("com.hnc.Discord".into()), false),
            CallStep::Ask("com.hnc.Discord".into())
        );
    }

    // SE-MEET-002
    #[test]
    fn a_call_that_starts_while_a_meeting_records_is_not_asked_about() {
        let mut watch = CallWatch::default();
        let zoom = || Some("us.zoom.xos".to_string());
        assert_eq!(watch.see(zoom(), true), CallStep::Nothing);
        // The recording stopped, the call goes on: still not asked.
        assert_eq!(watch.see(zoom(), false), CallStep::Nothing);
    }

    // SE-MEET-002
    #[test]
    fn a_browser_on_the_microphone_is_found_and_meet_is_known_by_its_title() {
        let chrome = process("com.google.Chrome.helper", "com.google.Chrome", true);
        assert_eq!(
            browser_on_microphone(&[chrome]).as_deref(),
            Some("com.google.Chrome")
        );
        assert_eq!(
            browser_on_microphone(&[process("us.zoom.xos", "", true)]),
            None
        );
        assert!(is_meet_title("Meet - abc-defg-hij"));
        assert!(is_meet_title("Meet \u{2013} abc-defg-hij"));
        assert!(!is_meet_title("Google Meet"));
        assert!(!is_meet_title("How to use Google Meet - YouTube"));
        assert!(!is_meet_title("YouTube"));
        assert!(!is_meet_title("Meeting notes - Google Docs"));
        assert_eq!(call_app_name("com.apple.Safari"), Some("Google Meet"));
    }

    #[test]
    fn every_call_app_has_a_name_for_the_question() {
        for bundle in &MEETING_APPS {
            assert!(call_app_name(bundle).is_some(), "{bundle}");
        }
        assert_eq!(call_app_name("us.zoom.xos"), Some("Zoom"));
        assert_eq!(call_app_name("com.example.Other"), None);
    }

    // SE-MEET-002
    #[test]
    fn only_a_yes_starts_a_recording() {
        let asked = || Some("us.zoom.xos".to_string());
        assert_eq!(app_to_record(false, asked()), None);
        assert_eq!(app_to_record(true, None), None);
        assert_eq!(app_to_record(true, asked()).as_deref(), Some("us.zoom.xos"));
    }

    // SE-MEET-021
    #[test]
    fn a_start_while_asked_records_the_asked_app_unless_a_source_was_picked() {
        let asked = || Some("us.zoom.xos".to_string());
        let teams = || MeetingSource::App("com.microsoft.teams2".to_string());
        // Automatic is a Yes: the app the question named.
        assert_eq!(
            source_when_asked(MeetingSource::Automatic, asked()),
            MeetingSource::App("us.zoom.xos".to_string())
        );
        // A picked source is recorded as picked.
        assert_eq!(
            source_when_asked(MeetingSource::Microphone, asked()),
            MeetingSource::Microphone
        );
        assert_eq!(source_when_asked(teams(), asked()), teams());
        // No question open: unchanged.
        assert_eq!(
            source_when_asked(MeetingSource::Automatic, None),
            MeetingSource::Automatic
        );
        assert_eq!(
            source_when_asked(MeetingSource::Microphone, None),
            MeetingSource::Microphone
        );
        assert_eq!(source_when_asked(teams(), None), teams());
    }

    fn app(bundle: &str, playing: bool) -> RunningApp {
        RunningApp {
            bundle_id: bundle.to_string(),
            name: bundle.to_string(),
            playing,
        }
    }

    #[test]
    fn a_playing_call_app_is_picked_before_a_browser() {
        // A quiet Zoom call wins over YouTube playing in Chrome.
        let running = [
            app("com.google.Chrome", true),
            app("us.zoom.xos", false),
            app("com.spotify.client", true),
        ];
        assert_eq!(
            pick_meeting_app(&running, None).as_deref(),
            Some("us.zoom.xos")
        );
        // With no call app, the remembered app, then a playing browser.
        let running = [
            app("com.google.Chrome", true),
            app("com.apple.Safari", false),
        ];
        assert_eq!(
            pick_meeting_app(&running, Some("com.apple.Safari")).as_deref(),
            Some("com.apple.Safari")
        );
        assert_eq!(
            pick_meeting_app(&running, None).as_deref(),
            Some("com.google.Chrome")
        );
        assert_eq!(MEETING_APPS[FIRST_BROWSER], "com.google.Chrome");
        let running = [app("com.google.Chrome", true), app("us.zoom.xos", true)];
        assert_eq!(
            pick_meeting_app(&running, None).as_deref(),
            Some("us.zoom.xos")
        );
        let running = [app("com.example.Custom", false)];
        assert_eq!(pick_meeting_app(&[], None), None);
        assert_eq!(
            pick_meeting_app(&running, Some("com.example.Custom")).as_deref(),
            Some("com.example.Custom")
        );
        assert_eq!(pick_meeting_app(&running, Some("us.zoom.xos")), None);
    }

    // SE-MEET-020
    #[test]
    fn an_empty_pick_records_the_microphone_only() {
        let running = [app("com.spotify.client", true)];
        assert_eq!(
            resolve_source(&MeetingSource::Automatic, &running, None),
            Ok(None)
        );
        assert_eq!(
            resolve_source(&MeetingSource::Automatic, &[], None),
            Ok(None)
        );
        // Automatic still picks a call app when one runs.
        let running = [app("us.zoom.xos", false)];
        assert_eq!(
            resolve_source(&MeetingSource::Automatic, &running, None),
            Ok(Some("us.zoom.xos".to_string()))
        );
        // Microphone only, even with a call app running.
        assert_eq!(
            resolve_source(&MeetingSource::Microphone, &running, None),
            Ok(None)
        );
    }

    // SE-MEET-020
    #[test]
    fn a_named_source_wins_and_must_be_running() {
        let running = [app("us.zoom.xos", true), app("com.google.Chrome", true)];
        let chrome = MeetingSource::App("com.google.Chrome".to_string());
        assert_eq!(
            resolve_source(&chrome, &running, None),
            Ok(Some("com.google.Chrome".to_string()))
        );
        let gone = MeetingSource::App("com.hnc.Discord".to_string());
        let error = resolve_source(&gone, &running, None).unwrap_err();
        assert!(error.starts_with("no-app:"), "{error}");
    }

    // SE-MEET-020
    #[test]
    fn the_source_menu_lists_meeting_apps_and_what_automatic_records() {
        let running = [
            app("com.google.Chrome", false),
            app("com.spotify.client", true),
            app("us.zoom.xos", false),
        ];
        let sources = meeting_sources(&running, None);
        assert_eq!(
            sources.automatic.map(|a| a.bundle_id).as_deref(),
            Some("us.zoom.xos")
        );
        let listed: Vec<_> = sources.apps.iter().map(|a| a.bundle_id.as_str()).collect();
        assert_eq!(listed, ["us.zoom.xos", "com.google.Chrome"]);
        // Nothing to pick: Automatic is the microphone only.
        let quiet = meeting_sources(&[app("com.spotify.client", true)], None);
        assert!(quiet.automatic.is_none());
        assert!(quiet.apps.is_empty());
    }

    // SE-MEET-020
    #[test]
    fn a_source_reaches_the_page_as_kind_and_value() {
        let json = |source: &MeetingSource| serde_json::to_string(source).unwrap();
        assert_eq!(json(&MeetingSource::Automatic), r#"{"kind":"automatic"}"#);
        assert_eq!(json(&MeetingSource::Microphone), r#"{"kind":"microphone"}"#);
        assert_eq!(
            json(&MeetingSource::App("us.zoom.xos".into())),
            r#"{"kind":"app","value":"us.zoom.xos"}"#
        );
        let back: MeetingSource = serde_json::from_str(r#"{"kind":"microphone"}"#).unwrap();
        assert_eq!(back, MeetingSource::Microphone);
    }

    fn zoom() -> String {
        "us.zoom.xos".to_string()
    }

    fn phase(bar: &Bar) -> String {
        bar.now().phase
    }

    fn recording(app_name: &str) -> MeetingState {
        MeetingState {
            phase: "recording".to_string(),
            app_name: Some(app_name.to_string()),
            ..MeetingState::default()
        }
    }

    fn finishing(phase: &str) -> MeetingState {
        MeetingState {
            phase: phase.to_string(),
            ..MeetingState::default()
        }
    }

    // SE-MEET-021 (race 1): the asked app and the question are one step, so
    // a start lands either before the question or after it, never between.
    #[test]
    fn a_start_and_the_watchers_question_never_leave_an_empty_question() {
        // The start first: no question opens while it claims the session.
        let mut bar = Bar::default();
        assert_eq!(
            bar.claim(MeetingSource::Automatic),
            Ok(MeetingSource::Automatic)
        );
        assert!(bar.ask(zoom(), Some("Zoom".into())).is_none());
        assert_eq!(phase(&bar), "idle");
        assert_eq!(start_refused(false, &phase(&bar)), None);
        // The question first: the start takes the asked app and closes it.
        let mut bar = Bar::default();
        assert!(bar.ask(zoom(), Some("Zoom".into())).is_some());
        assert_eq!(
            bar.claim(MeetingSource::Automatic),
            Ok(MeetingSource::App(zoom()))
        );
        assert_eq!(phase(&bar), "idle");
        assert_eq!(start_refused(false, &phase(&bar)), None);
        // A question on the bar always names the app a Yes records.
        let mut bar = Bar::default();
        bar.ask(zoom(), Some("Zoom".into()));
        assert_eq!(bar.answer(true), Some(zoom()));
        // Closing a question that is not open takes nothing.
        let mut bar = Bar::default();
        assert_eq!(bar.end_ask(), None);
    }

    // SE-MEET-021 (race 2)
    #[test]
    fn a_start_from_idle_is_not_refused_when_a_call_starts_while_it_looks_for_apps() {
        let mut bar = Bar::default();
        let source = bar.claim(MeetingSource::Automatic).unwrap();
        assert_eq!(source, MeetingSource::Automatic);
        // While try_start lists the running apps, a call takes the microphone.
        assert!(bar.ask(zoom(), Some("Zoom".into())).is_none());
        assert_eq!(start_refused(false, &phase(&bar)), None);
        bar.started(recording("zoom.us"));
        // Recording: still no question.
        assert!(bar.ask(zoom(), Some("Zoom".into())).is_none());
        assert_eq!(phase(&bar), "recording");
    }

    // SE-MEET-002 (race 3)
    #[test]
    fn a_yes_closes_only_the_question_it_answers() {
        let mut bar = Bar::default();
        bar.ask(zoom(), Some("Zoom".into()));
        // The Yes closes Zoom's question and claims the start in one step.
        assert_eq!(bar.answer(true), Some(zoom()));
        // A second call before that start records: no question opens, so
        // none is closed silently.
        assert!(bar
            .ask("com.hnc.Discord".into(), Some("Discord".into()))
            .is_none());
        assert_eq!(start_refused(false, &phase(&bar)), None);
        bar.started(recording("zoom.us"));
        assert_eq!(phase(&bar), "recording");
        // After a No nothing is claimed: the next call's question opens and
        // stays open until its own answer.
        let mut bar = Bar::default();
        bar.ask(zoom(), Some("Zoom".into()));
        assert_eq!(bar.answer(false), None);
        assert!(bar
            .ask("com.hnc.Discord".into(), Some("Discord".into()))
            .is_some());
        assert_eq!(phase(&bar), "asking");
        assert_eq!(bar.answer(true).as_deref(), Some("com.hnc.Discord"));
    }

    // SE-MEET-021
    #[test]
    fn a_start_while_asked_closes_the_question_and_records_the_asked_app_or_the_pick() {
        let teams = || MeetingSource::App("com.microsoft.teams2".to_string());
        for (picked, records) in [
            (MeetingSource::Automatic, MeetingSource::App(zoom())),
            (MeetingSource::Microphone, MeetingSource::Microphone),
            (teams(), teams()),
        ] {
            let mut bar = Bar::default();
            bar.ask(zoom(), Some("Zoom".into()));
            assert_eq!(bar.claim(picked), Ok(records));
            assert_eq!(phase(&bar), "idle");
            // Nothing left to answer: a late Yes records nothing.
            assert_eq!(bar.answer(true), None);
        }
        // A second start while one is on its way is the only refusal here.
        let mut bar = Bar::default();
        bar.claim(MeetingSource::Automatic).unwrap();
        assert!(bar
            .claim(MeetingSource::Microphone)
            .unwrap_err()
            .starts_with("running"));
    }

    // SE-MEET-002
    #[test]
    fn an_answered_call_is_not_asked_about_again() {
        let call = || Some(zoom());
        for answer in ["yes", "no", "start"] {
            let mut watch = CallWatch::default();
            let mut bar = Bar::default();
            let CallStep::Ask(id) = watch.see(call(), bar.busy()) else {
                panic!("not asked");
            };
            bar.ask(id, Some("Zoom".into()));
            match answer {
                "yes" => assert!(bar.answer(true).is_some()),
                "no" => assert!(bar.answer(false).is_none()),
                _ => assert!(bar.claim(MeetingSource::Automatic).is_ok()),
            }
            if answer != "no" {
                // The meeting records, is finished, and the bar is idle.
                bar.started(recording("zoom.us"));
                bar.set(finishing("idle"));
            }
            // The same call goes on with an idle bar: no second question.
            assert_eq!(phase(&bar), "idle");
            assert!(!bar.busy());
            for _ in 0..3 {
                assert_eq!(watch.see(call(), bar.busy()), CallStep::Nothing, "{answer}");
            }
        }
    }

    // SE-MEET-002
    #[test]
    fn a_call_that_starts_while_a_start_is_on_its_way_counts_as_seen() {
        let mut watch = CallWatch::default();
        let mut bar = Bar::default();
        assert!(!bar.busy());
        bar.claim(MeetingSource::Microphone).unwrap();
        assert!(bar.busy());
        assert_eq!(watch.see(Some(zoom()), bar.busy()), CallStep::Nothing);
        // The start fails: like a call seen while recording, not asked later.
        bar.failed("microphone: busy".into(), false);
        assert!(!bar.busy());
        assert_eq!(watch.see(Some(zoom()), bar.busy()), CallStep::Nothing);
    }

    // SE-MEET-023
    #[test]
    fn with_the_switch_off_the_watcher_never_asks() {
        let mut watch = CallWatch::default();
        let bar = Bar::default();
        for holder in [Some(zoom()), Some("com.hnc.Discord".into()), None] {
            for _ in 0..CALL_GAP_POLLS + 1 {
                let step = watch.look(holder.clone(), bar.busy(), false);
                assert!(!matches!(step, CallStep::Ask(_)), "{step:?}");
            }
        }
    }

    // SE-MEET-023
    #[test]
    fn a_call_seen_while_off_is_not_asked_about_after_switching_on() {
        let mut watch = CallWatch::default();
        assert_eq!(watch.look(Some(zoom()), false, false), CallStep::Silenced);
        // Switched on during the same call: no question.
        assert_eq!(watch.look(Some(zoom()), false, true), CallStep::Nothing);
        // The call ends; the next one is asked about.
        for _ in 0..CALL_GAP_POLLS - 1 {
            assert_eq!(watch.look(None, false, true), CallStep::Nothing);
        }
        assert_eq!(watch.look(None, false, true), CallStep::CallEnded);
        assert_eq!(watch.look(Some(zoom()), false, true), CallStep::Ask(zoom()));
    }

    // SE-MEET-023
    #[test]
    fn an_open_question_closes_when_the_switch_is_turned_off() {
        let mut watch = CallWatch::default();
        let mut bar = Bar::default();
        let CallStep::Ask(id) = watch.look(Some(zoom()), bar.busy(), true) else {
            panic!("not asked");
        };
        bar.ask(id, Some("Zoom".into())).expect("asked");
        // The next poll after the switch goes off closes it (the watcher
        // runs end_ask on Silenced), and nothing records.
        assert_eq!(
            watch.look(Some(zoom()), bar.busy(), false),
            CallStep::Silenced
        );
        assert_eq!(bar.end_ask(), Some(zoom()));
        assert_eq!(phase(&bar), "idle");
        assert!(!bar.busy());
        // Even with no call left on the microphone, a poll while off closes.
        assert_eq!(watch.look(None, false, false), CallStep::Silenced);
    }

    // SE-MEET-021
    #[test]
    fn a_panicked_start_lets_go_of_its_own_claim_only() {
        let mut bar = Bar::default();
        bar.claim(MeetingSource::Automatic).unwrap();
        let first = bar.claim_id();
        bar.started(recording("zoom.us"));
        bar.claim(MeetingSource::Microphone).unwrap();
        // The first start panics after it recorded: the second keeps its claim.
        bar.release(first);
        assert!(bar.busy());
        assert!(bar.ask(zoom(), None).is_none());
        bar.release(bar.claim_id());
        assert!(bar.claim(MeetingSource::Automatic).is_ok());
    }

    // SE-MEET-002
    #[test]
    fn the_bars_close_clears_an_error_but_never_a_question() {
        let mut bar = Bar::default();
        bar.claim(MeetingSource::Automatic).unwrap();
        bar.failed("no-app: gone".into(), false);
        let cleared = bar.clear_error().expect("cleared");
        assert_eq!((cleared.phase.as_str(), cleared.error), ("idle", None));
        // A question that opened before the × lands stays with its app.
        bar.ask(zoom(), Some("Zoom".into()));
        assert!(bar.clear_error().is_none());
        assert_eq!(phase(&bar), "asking");
        assert_eq!(bar.answer(true), Some(zoom()));
    }

    // SE-MEET-021
    #[test]
    fn transcribing_and_notes_refuse_a_start_and_keep_their_bar() {
        for phase_now in ["transcribing", "notes"] {
            let mut bar = Bar::default();
            bar.set(finishing(phase_now));
            assert!(bar.ask(zoom(), None).is_none());
            let source = bar.claim(MeetingSource::Automatic).unwrap();
            assert_eq!(source, MeetingSource::Automatic);
            let refused = start_refused(false, &phase(&bar)).expect("refused");
            assert!(refused.starts_with("running"));
            // The refusal lets the claim go and leaves the bar as it was.
            assert!(bar.failed(refused, false).is_none());
            assert_eq!(phase(&bar), phase_now);
            assert!(bar.claim(MeetingSource::Automatic).is_ok());
        }
        assert!(start_refused(true, "idle").is_some());
        assert_eq!(start_refused(false, "idle"), None);
    }

    // SE-MEET-001, SE-MEET-021
    #[test]
    fn a_failed_start_shows_its_error_on_an_idle_bar_and_lets_the_claim_go() {
        let mut bar = Bar::default();
        bar.ask(zoom(), Some("Zoom".into()));
        bar.claim(MeetingSource::Automatic).unwrap();
        let shown = bar.failed("no-app: gone".into(), false).expect("shown");
        assert_eq!(shown.phase, "idle");
        assert_eq!(shown.error.as_deref(), Some("no-app: gone"));
        // The open error keeps the next question away until its ×.
        assert!(bar.ask("com.hnc.Discord".into(), None).is_none());
        bar.set(MeetingState {
            error: None,
            ..bar.now()
        });
        assert!(bar.ask("com.hnc.Discord".into(), None).is_some());
        // A failure while a meeting records leaves its bar alone.
        let mut bar = Bar::default();
        bar.started(recording("zoom.us"));
        bar.claim(MeetingSource::Automatic).unwrap();
        assert!(bar.failed("running: x".into(), true).is_none());
        assert_eq!(phase(&bar), "recording");
    }
}
