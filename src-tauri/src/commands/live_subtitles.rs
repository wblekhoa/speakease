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
    session::start(&app, bundle_id.clone(), source, target)?;
    // Started from SpeakEase's window: go back to what is playing, so its
    // subtitles show over it at once (SE-LIVE-012).
    if !crate::system_audio_tap::activate_app(&bundle_id) {
        log::warn!("Live subtitles: could not bring {bundle_id} to the front");
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn stop_live_subtitles(app: AppHandle) {
    session::stop(&app);
}

/// The subtitle panel's Translate switch.
#[tauri::command]
#[specta::specta]
pub fn set_live_subtitles_translate(app: AppHandle, on: bool) {
    session::set_translate(&app, on);
}

/// The subtitle page fits its window to the bubbles it shows (height) and
/// to the width the user dragged its edge to.
#[tauri::command]
#[specta::specta]
pub fn fit_live_subtitles_panel(
    app: AppHandle,
    height: Option<f64>,
    width: Option<f64>,
    keep_right: bool,
) {
    crate::subtitle_window::fit_frame(
        &app,
        height.map(|h| h.clamp(60.0, 900.0)),
        width.map(|w| w.clamp(320.0, 960.0)),
        keep_right,
    );
}
