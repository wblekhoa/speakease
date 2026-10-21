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

/// The panel's play/pause button: the system Play/Pause key, which macOS
/// sends to the app playing (SE-LIVE-014).
#[tauri::command]
#[specta::specta]
pub fn live_subtitles_play_pause() -> bool {
    let sent = crate::system_audio_tap::media_play_pause();
    if !sent {
        log::warn!("Live subtitles: could not send the Play/Pause key");
    }
    sent
}

// SE-LIVE-015
/// The subtitle page's Translator choice: "auto", "apple" or "local"; used
/// from the next session.
#[tauri::command]
#[specta::specta]
pub fn change_live_subtitle_translator_setting(
    app: AppHandle,
    value: String,
) -> Result<(), String> {
    if !matches!(value.as_str(), "auto" | "apple" | "local") {
        return Err(format!("unknown translator: {value}"));
    }
    let mut settings = crate::settings::get_settings(&app);
    settings.live_subtitle_translator = Some(value);
    crate::settings::write_settings(&app, settings);
    Ok(())
}

/// Whether an on-device AI model is downloaded and chosen (the page warns
/// when the on-device translator has none).
#[tauri::command]
#[specta::specta]
pub fn has_local_ai_model(app: AppHandle) -> bool {
    crate::local_ai::active_model(&app).is_some()
}
