//! SpeakEase meeting recording (phase 2 of `ai-memory/plans/meeting-notes-build.md`):
//! the microphone as "Me" and the meeting app's sound (a process tap, shared
//! with live subtitles) as "Others", recorded side by side; when the meeting
//! stops, both tracks are cut at pauses, recognised with the selected model,
//! merged by time into one transcript, saved as a History entry, and the notes
//! are written in the background (`meeting_notes`). Rules SE-MEET-001, 003,
//! 004, 006, 008, 013 in `docs/product/logic/meetings.md`.

use crate::live_subtitles::{Cuts, Segmenter, FRAME_SAMPLES};
use serde::Serialize;
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
}

/// Vietnamese labels for a Vietnamese interface, English otherwise.
pub fn labels(app_language: &str) -> Labels {
    if app_language.starts_with("vi") {
        Labels {
            me: "Tôi",
            others: "Người khác",
            dictation: "đọc chính tả",
        }
    } else {
        Labels {
            me: "Me",
            others: "Others",
            dictation: "dictation",
        }
    }
}

// SE-MEET-001, SE-MEET-008
/// One line per turn in time order: `[Tôi] …`, `[Người khác] …`, and a
/// dictation as `[Tôi · đọc chính tả] …`.
pub fn transcript(turns: &[Turn], labels: &Labels) -> String {
    let mut ordered: Vec<&Turn> = turns.iter().filter(|t| !t.text.trim().is_empty()).collect();
    ordered.sort_by_key(|t| (t.start_ms, t.speaker == Speaker::Others));
    ordered
        .iter()
        .map(|turn| {
            let who = match (turn.speaker, turn.dictation) {
                (Speaker::Me, true) => format!("{} · {}", labels.me, labels.dictation),
                (Speaker::Me, false) => labels.me.to_string(),
                (Speaker::Others, _) => labels.others.to_string(),
            };
            format!("[{who}] {}", turn.text.trim())
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The two tracks as one, for the History entry's audio.
pub fn mix(me: &[f32], others: &[f32]) -> Vec<f32> {
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

/// Where a meeting stands, for the meeting bar and the window.
#[derive(Debug, Clone, Default, Serialize, Type)]
pub struct MeetingState {
    /// "idle", "recording", "transcribing" or "notes".
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
    static STATE: Mutex<Option<MeetingState>> = Mutex::new(None);

    /// The event the meeting bar and the window listen to.
    pub const STATE_EVENT: &str = "meeting-state";

    /// The meeting's state now.
    pub fn state() -> MeetingState {
        STATE
            .lock()
            .ok()
            .and_then(|s| s.clone())
            .unwrap_or_else(|| MeetingState {
                phase: "idle".to_string(),
                ..MeetingState::default()
            })
    }

    /// Whether a meeting is recording now.
    pub fn is_recording() -> bool {
        RUNNING.lock().is_ok_and(|r| r.is_some())
    }

    fn announce(app: &AppHandle, state: MeetingState) {
        if let Ok(mut slot) = STATE.lock() {
            *slot = Some(state.clone());
        }
        let _ = app.emit(STATE_EVENT, &state);
        crate::meeting_window::follow(app, &state);
        crate::tray::update_tray_menu(app);
    }

    // SE-MEET-001
    /// Starts recording a meeting with `bundle_id` as "Others" (or the app
    /// [`pick_meeting_app`] finds). Never starts a dictation.
    /// A start that fails shows why on the meeting bar, with its ×.
    pub fn start(app: &AppHandle, bundle_id: Option<String>) -> Result<(), String> {
        try_start(app, bundle_id).inspect_err(|e| {
            log::warn!("Meeting: {e}");
            // A meeting still recording or being finished keeps its bar.
            if !is_recording() && state().phase == "idle" {
                announce(
                    app,
                    MeetingState {
                        phase: "idle".to_string(),
                        error: Some(e.clone()),
                        ..MeetingState::default()
                    },
                );
            }
        })
    }

    fn try_start(app: &AppHandle, bundle_id: Option<String>) -> Result<(), String> {
        // SE-MEET-003: hidden without the process tap (macOS 14.2+).
        if !crate::system_audio_tap::available() {
            return Err("unsupported: meeting notes need macOS 14.2".to_string());
        }
        let settings = crate::settings::get_settings(app);
        let running_apps = crate::system_audio_tap::list_apps();
        let bundle_id = bundle_id
            .or_else(|| pick_meeting_app(&running_apps, settings.meeting_app.as_deref()))
            .ok_or_else(|| "no-app: no meeting app is running".to_string())?;
        let app_name = running_apps
            .iter()
            .find(|a| a.bundle_id == bundle_id)
            .map(|a| a.name.clone())
            .unwrap_or_else(|| bundle_id.clone());
        let stop = Arc::new(AtomicBool::new(false));
        {
            let mut running = RUNNING.lock().map_err(|e| e.to_string())?;
            // The last meeting is still being transcribed or noted: its
            // thread owns the bar until it is idle again.
            if running.is_some() || state().phase != "idle" {
                return Err("running: a meeting is already recording".to_string());
            }
            *running = Some(Running { stop: stop.clone() });
        }
        let (tap, chunks) = match crate::system_audio_tap::start(&bundle_id, false) {
            Ok(tap) => tap,
            Err(e) => {
                clear_running();
                return Err(e);
            }
        };
        let mut recorder = match open_microphone(app) {
            Ok(recorder) => recorder,
            Err(e) => {
                clear_running();
                return Err(e);
            }
        };
        // Read again: opening the microphone can take seconds, and a change
        // made meanwhile must not be written over.
        let mut settings = crate::settings::get_settings(app);
        settings.meeting_app = Some(bundle_id.clone());
        crate::settings::write_settings(app, settings);

        let started = Instant::now();
        let started_at = chrono::Utc::now().timestamp();
        announce(
            app,
            MeetingState {
                phase: "recording".to_string(),
                started_at: Some(started_at),
                app_name: Some(app_name.clone()),
                ..MeetingState::default()
            },
        );
        log::info!("Meeting: recording {bundle_id} and the microphone");

        let app = app.clone();
        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let recording = record(&app, &stop, started, chunks);
                drop(tap);
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
                        app_name: app_name.clone(),
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
            "idle" => announce(app, MeetingState { error: None, ..now }),
            "recording" => {}
            _ => crate::meeting_window::hide(app),
        }
    }

    /// Stops a recording meeting, or starts one with the app found running.
    /// Returns the error a start ran into.
    pub fn toggle(app: &AppHandle) -> Result<(), String> {
        if is_recording() {
            stop();
            Ok(())
        } else if state().phase != "idle" {
            // Still finishing the last meeting: show its progress again (the
            // bar may have been closed with ×).
            crate::meeting_window::follow(app, &state());
            Ok(())
        } else {
            start(app, None)
        }
    }

    /// The microphone the user picked for dictation, as a second stream of
    /// its own (CoreAudio lets both read the same device), with no VAD so
    /// the whole meeting is kept.
    fn open_microphone(app: &AppHandle) -> Result<AudioRecorder, String> {
        let device = app
            .try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
            .and_then(|audio| audio.meeting_microphone());
        let mut recorder = AudioRecorder::new().map_err(|e| format!("microphone: {e}"))?;
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
    fn record(
        app: &AppHandle,
        stop: &AtomicBool,
        started: Instant,
        chunks: std::sync::mpsc::Receiver<crate::system_audio_tap::TapChunk>,
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
        app_name: String,
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

    // SE-MEET-006
    /// After the stop: recognise both tracks with the selected (accurate)
    /// model, save the meeting, then write its notes.
    fn finish(app: &AppHandle, done: Finished) -> Result<(), String> {
        set_phase(app, "transcribing", None);
        let text = transcribe_tracks(app, &done.me, &done.others, &done.dictations)?;
        let history = app.state::<Arc<HistoryManager>>().inner().clone();
        let file_name = format!("file-meeting-{}.wav", done.started_at);
        let wav = history.recordings_dir().join(&file_name);
        let mixed = mix(&done.me, &done.others);
        if let Err(e) = crate::audio_toolkit::save_wav_file(&wav, &mixed) {
            log::warn!("Meeting: cannot keep the audio: {e}");
        }
        let title = format!(
            "{} · {}",
            done.app_name,
            chrono::DateTime::from_timestamp(done.started_at, 0)
                .map(|t| {
                    t.with_timezone(&chrono::Local)
                        .format("%d/%m %H:%M")
                        .to_string()
                })
                .unwrap_or_default()
        );
        let entry = history
            .save_titled_entry(file_name, title, text.clone())
            .map_err(|e| e.to_string())?;
        history
            .save_meeting(entry.id, &done.app_name, done.started_at, done.duration_ms)
            .map_err(|e| e.to_string())?;
        set_phase(app, "notes", Some(entry.id));
        write_notes_for(app, &history, entry.id, &text, Some(&done.app_name));
        Ok(())
    }

    /// Both tracks as one labelled transcript, recognised span by span with
    /// the selected model. An empty transcript is still a meeting: its notes
    /// say so (SE-MEET-009).
    fn transcribe_tracks(
        app: &AppHandle,
        me: &[f32],
        others: &[f32],
        dictations: &[(u64, u64)],
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
        Ok(transcript(&turns, &labels(&settings.app_language)))
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
        let recording = record(app, &stop, started, chunks);
        drop(tap);
        log::info!(
            "Meeting probe: {:.1} s of app sound",
            recording.others.len() as f64 / RATE as f64
        );
        transcribe_tracks(app, &[], &recording.others, &recording.dictations)
    }

    // SE-MEET-009, SE-MEET-012
    /// Writes a meeting's notes with the engine this Mac has and stores them.
    pub fn write_notes_for(
        app: &AppHandle,
        history: &HistoryManager,
        history_id: i64,
        transcript: &str,
        app_name: Option<&str>,
    ) {
        use crate::meeting_notes as notes;
        let stored = if !notes::has_substance(transcript) {
            let empty = notes::empty_notes(transcript, None);
            (
                Some(empty.kind.id()),
                Some(empty.text),
                "empty".to_string(),
                None,
            )
        } else {
            match notes::engine_for(app) {
                Err(reason) => (None, None, format!("no_ai:{}", no_ai_id(reason)), None),
                Ok(engine) => {
                    let engine_name = engine_label(&engine);
                    let ai = notes::EngineAi {
                        app: app.clone(),
                        engine,
                    };
                    let result = tauri::async_runtime::block_on(notes::write_notes(
                        &ai,
                        transcript,
                        None,
                        app_name,
                        &mut |step| log::debug!("Meeting notes: {step}"),
                    ));
                    match result {
                        Ok(written) => (
                            Some(written.kind.id()),
                            Some(written.text),
                            "done".to_string(),
                            Some(engine_name),
                        ),
                        Err(e) => {
                            log::warn!("Meeting notes: {e}");
                            (None, None, "failed".to_string(), Some(engine_name))
                        }
                    }
                }
            }
        };
        let (kind, text, state, engine) = stored;
        if let Err(e) =
            history.set_meeting_notes(history_id, kind, text.as_deref(), &state, engine.as_deref())
        {
            log::error!("Meeting notes: cannot save: {e}");
        }
        let _ = app.emit("meeting-notes-updated", history_id);
    }

    fn no_ai_id(reason: crate::meeting_notes::NoAiReason) -> &'static str {
        match reason {
            crate::meeting_notes::NoAiReason::AiOff => "ai_off",
            crate::meeting_notes::NoAiReason::NothingAvailable => "nothing_available",
        }
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::system_audio_tap::RunningApp;

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
            transcript(&turns, &labels("vi")),
            "[Tôi] alo mọi người\n[Người khác] mình bắt đầu nhé\n[Tôi · đọc chính tả] gửi email cho chị Lan"
        );
        assert!(transcript(&turns, &labels("en")).starts_with("[Me] alo"));
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
        let mixed = mix(&[0.4, 0.4], &[0.2, 0.2, 0.2]);
        assert_eq!(mixed.len(), 3);
        assert!((mixed[0] - 0.3).abs() < 1e-6);
        assert!((mixed[2] - 0.1).abs() < 1e-6);
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
        assert_eq!(
            pick_meeting_app(&running, Some("com.example.Custom")).as_deref(),
            Some("com.example.Custom")
        );
        assert_eq!(pick_meeting_app(&running, Some("us.zoom.xos")), None);
    }
}
