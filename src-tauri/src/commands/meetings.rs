//! SpeakEase meeting notes (beta): start and stop a meeting, the meeting
//! bar's state, and the stored meetings. The work is `meeting::session`.

use crate::managers::history::{HistoryManager, Meeting};
use crate::meeting::{session, MeetingSource, MeetingSources, MeetingState};
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, State};

// SE-MEET-020
/// Starts recording a meeting from `source`: Automatic (the app found
/// running, else the microphone only), the microphone only, or a named app.
/// Errors: "unsupported: …", "no-app: …" (the named app is not running),
/// "running: …", "microphone: …".
#[tauri::command]
#[specta::specta]
pub fn start_meeting(app: AppHandle, source: MeetingSource) -> Result<(), String> {
    session::start(&app, source)
}

// SE-MEET-020
/// What a source menu offers now: what Automatic would record (None: the
/// microphone only) and each running call app or browser. "Microphone
/// only" is always offered and is not listed.
#[tauri::command]
#[specta::specta]
pub fn meeting_sources(app: AppHandle) -> MeetingSources {
    let settings = crate::settings::get_settings(&app);
    crate::meeting::meeting_sources(
        &crate::system_audio_tap::list_apps(),
        settings.meeting_app.as_deref(),
    )
}

#[tauri::command]
#[specta::specta]
pub fn stop_meeting() {
    session::stop();
}

#[tauri::command]
#[specta::specta]
pub fn meeting_state() -> MeetingState {
    session::state()
}

/// The meeting bar's ×: clears a finished meeting's error, or hides the bar
/// while the meeting is being finished.
#[tauri::command]
#[specta::specta]
pub fn close_meeting_bar(app: AppHandle) {
    session::dismiss(&app);
}

// SE-MEET-005
/// The live panel's state now.
#[tauri::command]
#[specta::specta]
pub fn meeting_live() -> crate::meeting_live::LiveView {
    crate::meeting_live::session::view()
}

/// The pill's level buttons: this meeting only.
#[tauri::command]
#[specta::specta]
pub fn set_meeting_live_level(app: AppHandle, level: u8) {
    crate::meeting_live::session::set_level(&app, level);
}

// SE-MEET-016
#[tauri::command]
#[specta::specta]
pub fn set_meeting_panel(app: AppHandle, open: bool) {
    crate::meeting_live::session::set_panel(&app, open);
}

// SE-MEET-005 level 3
/// "What did I miss?": the last minutes of the meeting, briefly. Errors:
/// "empty: …" or "no_ai:<reason>".
#[tauri::command]
#[specta::specta]
pub async fn meeting_catch_up(app: AppHandle) -> Result<String, String> {
    crate::meeting_live::session::catch_up(&app).await
}

/// The level a meeting starts at, from Settings (1-5).
#[tauri::command]
#[specta::specta]
pub fn change_meeting_live_level_setting(app: AppHandle, level: u8) {
    let mut settings = crate::settings::get_settings(&app);
    settings.meeting_live_level = crate::meeting_live::clamp_level(level);
    crate::settings::write_settings(&app, settings);
}

// SE-MEET-023
/// Whether a call app starting to use the microphone asks "Take notes of
/// this call?". Off closes an open question within one poll.
#[tauri::command]
#[specta::specta]
pub fn change_meeting_ask_on_call_setting(app: AppHandle, enabled: bool) {
    let mut settings = crate::settings::get_settings(&app);
    settings.meeting_ask_on_call = enabled;
    crate::settings::write_settings(&app, settings);
}

// SE-MEET-002
/// The meeting bar's answer to "take notes of this call?": only a yes
/// records. Returns the error a start ran into.
#[tauri::command]
#[specta::specta]
pub fn answer_meeting_ask(app: AppHandle, yes: bool) -> Result<(), String> {
    session::answer(&app, yes)
}

/// A meeting with its History entry's title and transcript, for the
/// Meetings page (SE-MEET-018).
#[derive(Debug, Clone, Serialize, Type)]
pub struct MeetingEntry {
    pub meeting: Meeting,
    pub title: String,
    pub transcript: String,
}

async fn with_entry(
    history: &HistoryManager,
    meeting: Meeting,
) -> Result<Option<MeetingEntry>, String> {
    Ok(history
        .get_entry_by_id(meeting.history_id)
        .await
        .map_err(|e| e.to_string())?
        .map(|entry| MeetingEntry {
            meeting,
            title: entry.title,
            transcript: entry.transcription_text,
        }))
}

#[tauri::command]
#[specta::specta]
pub async fn get_meeting(
    history_manager: State<'_, Arc<HistoryManager>>,
    history_id: i64,
) -> Result<Option<MeetingEntry>, String> {
    match history_manager
        .get_meeting(history_id)
        .map_err(|e| e.to_string())?
    {
        Some(meeting) => with_entry(&history_manager, meeting).await,
        None => Ok(None),
    }
}

/// Every meeting, newest first.
#[tauri::command]
#[specta::specta]
pub async fn list_meetings(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<Vec<MeetingEntry>, String> {
    let mut out = Vec::new();
    for meeting in history_manager.list_meetings().map_err(|e| e.to_string())? {
        out.extend(with_entry(&history_manager, meeting).await?);
    }
    Ok(out)
}

// SE-MEET-010
/// The template switch: writes the notes again as `kind` (meeting, call,
/// lecture or interview), in the background.
#[tauri::command]
#[specta::specta]
pub fn rewrite_meeting_notes(app: AppHandle, history_id: i64, kind: String) -> Result<(), String> {
    let kind = crate::meeting_notes::NoteKind::from_id(&kind)
        .ok_or_else(|| format!("kind: unknown template {kind}"))?;
    session::rewrite_notes(&app, history_id, kind)
}

// SE-MEET-019
/// "Take meeting notes" on a Files entry: lists it as a meeting and writes
/// its notes in the template AI guesses, in the background.
#[tauri::command]
#[specta::specta]
pub async fn note_file_as_meeting(app: AppHandle, history_id: i64) -> Result<(), String> {
    session::note_file(&app, history_id).await
}

// SE-MEET-014
/// Why no AI can answer right now (`ai_off` / `nothing_available` /
/// `notes_model_missing`), or `None`, so the Q&A says so before a question
/// is typed.
#[tauri::command]
#[specta::specta]
pub fn meeting_ai_missing(app: AppHandle) -> Option<String> {
    session::ai_missing(&app)
}

/// One question about a meeting, answered only from its transcript and
/// notes, with the transcript lines it used. Errors: "missing: …", or
/// "no_ai:<reason>" when this Mac has no AI for it.
#[tauri::command]
#[specta::specta]
pub async fn ask_meeting(
    app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    history_id: i64,
    question: String,
) -> Result<crate::meeting_ask::MeetingAnswer, String> {
    if question.trim().is_empty() {
        return Err("empty: no question".to_string());
    }
    let meeting = history_manager
        .get_meeting(history_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "missing: no such meeting".to_string())?;
    let notes = (meeting.notes_state == "done")
        .then(|| meeting.notes.clone())
        .flatten();
    let entry = with_entry(&history_manager, meeting)
        .await?
        .ok_or_else(|| "missing: the History entry is gone".to_string())?;
    let engine = crate::meeting_notes::engine_for(&app)
        .map_err(|reason| format!("no_ai:{}", session::no_ai_id(reason)))?;
    let ai = crate::meeting_notes::EngineAi { app, engine };
    crate::meeting_ask::ask(&ai, &entry.transcript, notes.as_deref(), &question).await
}
