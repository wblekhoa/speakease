//! SpeakEase meeting notes (beta): start and stop a meeting, the meeting
//! bar's state, and the stored meetings. The work is `meeting::session`.

use crate::managers::history::{HistoryManager, Meeting};
use crate::meeting::{session, MeetingState};
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

/// The meeting bar's ×: clears a finished meeting's error and hides the bar.
#[tauri::command]
#[specta::specta]
pub fn close_meeting_bar(app: AppHandle) {
    session::dismiss(&app);
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting(
    history_manager: State<'_, Arc<HistoryManager>>,
    history_id: i64,
) -> Result<Option<Meeting>, String> {
    history_manager
        .get_meeting(history_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_meetings(
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<Vec<Meeting>, String> {
    history_manager.list_meetings().map_err(|e| e.to_string())
}
