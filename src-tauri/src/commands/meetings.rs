//! SpeakEase meeting notes (beta): start and stop a meeting, the meeting
//! bar's state, and the stored meetings. The work is `meeting::session`.

use crate::managers::history::{HistoryManager, Meeting};
use crate::meeting::{session, MeetingState};
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Starts recording a meeting with `bundle_id` as "Others", or with the
/// meeting app found running when it is None.
#[tauri::command]
#[specta::specta]
pub fn start_meeting(app: AppHandle, bundle_id: Option<String>) -> Result<(), String> {
    session::start(&app, bundle_id)
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

// SE-MEET-014
/// Why no AI can answer right now (`ai_off` / `nothing_available`), or
/// `None`, so the Q&A says so before a question is typed.
#[tauri::command]
#[specta::specta]
pub fn meeting_ai_missing(app: AppHandle) -> Option<String> {
    crate::meeting_notes::engine_for(&app)
        .err()
        .map(|reason| session::no_ai_id(reason).to_string())
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
