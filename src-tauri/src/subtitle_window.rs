//! SpeakEase live subtitles: the floating bilingual bar (owner, 16/10: a bar
//! at the bottom of the screen, draggable). A non-activating panel like the
//! recording pill, so the app being watched keeps focus; it takes clicks only
//! for dragging and its close button.

use tauri::AppHandle;

pub const LABEL: &str = "live_subtitles";
const WIDTH: f64 = 760.0;
const HEIGHT: f64 = 150.0;
/// Above the Dock / the bottom of the visible area.
const BOTTOM_GAP: f64 = 72.0;

#[cfg(target_os = "macos")]
mod imp {
    use super::{BOTTOM_GAP, HEIGHT, LABEL, WIDTH};
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};

    tauri_panel! {
        panel!(SubtitlePanel {
            config: {
                can_become_key_window: false,
                is_floating_panel: true
            }
        })
    }

    fn bottom_centre(app: &AppHandle) -> Option<(f64, f64)> {
        let monitor = crate::overlay::get_monitor_with_cursor(app)?;
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let x = area.position.x as f64 / scale + (area.size.width as f64 / scale - WIDTH) / 2.0;
        let y = (area.position.y as f64 + area.size.height as f64) / scale - HEIGHT - BOTTOM_GAP;
        Some((x, y))
    }

    /// Shows the bar, creating it on first use. A bar the user dragged stays
    /// where they left it (its page remembers and restores the spot).
    pub fn show(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window(LABEL) {
                let _ = window.show();
                return;
            }
            let Some((x, y)) = bottom_centre(&handle) else {
                log::warn!("Live subtitles: no monitor for the subtitle bar");
                return;
            };
            match PanelBuilder::<_, SubtitlePanel>::new(&handle, LABEL)
                .url(WebviewUrl::App("src/subtitles/index.html".into()))
                .title("Live subtitles")
                .position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
                .level(PanelLevel::Status)
                .size(tauri::Size::Logical(tauri::LogicalSize {
                    width: WIDTH,
                    height: HEIGHT,
                }))
                .has_shadow(false)
                .transparent(true)
                .no_activate(true)
                .corner_radius(0.0)
                .style_mask(StyleMask::empty().borderless().nonactivating_panel())
                .with_window(|w| w.decorations(false).transparent(true).focusable(false))
                .collection_behavior(
                    CollectionBehavior::new()
                        .can_join_all_spaces()
                        .full_screen_auxiliary(),
                )
                .build()
            {
                Ok(panel) => panel.show(),
                Err(e) => log::error!("Live subtitles: cannot create the subtitle bar: {e}"),
            }
        });
    }

    pub fn hide(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window(LABEL) {
                let _ = window.hide();
            }
        });
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use tauri::AppHandle;
    pub fn show(_app: &AppHandle) {}
    pub fn hide(_app: &AppHandle) {}
}

pub fn show(app: &AppHandle) {
    imp::show(app)
}

pub fn hide(app: &AppHandle) {
    imp::hide(app)
}
