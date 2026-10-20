//! SpeakEase live subtitles (beta): what the window needs to pick an app and
//! start or stop a session. The session itself is `live_subtitles::session`.

use crate::live_subtitles::session::{self, SubtitleState};
use crate::system_audio_tap::RunningApp;
use tauri::AppHandle;

/// Whether this Mac can hear another app (macOS 14.2+ on Apple silicon).
#[tauri::command]
#[specta::specta]
pub fn live_subtitles_supported() -> bool {
    crate::system_audio_tap::available()
}

/// Running apps for the picker, those playing sound first.
#[tauri::command]
#[specta::specta]
pub fn live_subtitle_apps() -> Vec<RunningApp> {
    crate::system_audio_tap::list_apps()
}

#[tauri::command]
#[specta::specta]
pub fn live_subtitles_state() -> SubtitleState {
    session::state()
}

#[tauri::command]
#[specta::specta]
pub fn start_live_subtitles(
    app: AppHandle,
    bundle_id: String,
    source: String,
    target: String,
) -> Result<(), String> {
    session::start(&app, bundle_id, source, target)
}

#[tauri::command]
#[specta::specta]
pub fn stop_live_subtitles() {
    session::stop();
}

/// The subtitle panel's Translate switch.
#[tauri::command]
#[specta::specta]
pub fn set_live_subtitles_translate(app: AppHandle, on: bool) {
    session::set_translate(&app, on);
}
