//! SpeakEase meeting notes: the meeting bar, a small floating pill at the top
//! of the screen while a meeting records - the consent line, a timer and
//! Stop (SE-MEET-004, level 1 of SE-MEET-005). A non-activating panel like
//! the subtitle panel (`subtitle_window.rs`), so the meeting app keeps focus.

use crate::meeting::MeetingState;
use tauri::AppHandle;

pub const LABEL: &str = "meeting_bar";
const WIDTH: f64 = 460.0;
const HEIGHT: f64 = 64.0;
const TOP_GAP: f64 = 8.0;

#[cfg(target_os = "macos")]
mod imp {
    use super::{HEIGHT, LABEL, TOP_GAP, WIDTH};
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tauri_nspanel::{
        tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask,
    };

    tauri_panel! {
        panel!(MeetingPanel {
            config: {
                can_become_key_window: false,
                is_floating_panel: true
            }
        })
    }

    fn top_center(app: &AppHandle) -> Option<(f64, f64)> {
        let monitor = crate::overlay::get_monitor_with_cursor(app)?;
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let x = (area.position.x as f64 + area.size.width as f64 / 2.0) / scale - WIDTH / 2.0;
        let y = area.position.y as f64 / scale + TOP_GAP;
        Some((x, y))
    }

    pub fn show(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Ok(panel) = handle.get_webview_panel(LABEL) {
                panel.set_level(PanelLevel::Status.value());
                panel.order_front_regardless();
                return;
            }
            let Some((x, y)) = top_center(&handle) else {
                log::warn!("Meeting: no monitor for the meeting bar");
                return;
            };
            match PanelBuilder::<_, MeetingPanel>::new(&handle, LABEL)
                .url(WebviewUrl::App("src/meeting/index.html".into()))
                .title("Meeting")
                .position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
                .level(PanelLevel::Status)
                .size(tauri::Size::Logical(tauri::LogicalSize {
                    width: WIDTH,
                    height: HEIGHT,
                }))
                .has_shadow(false)
                .transparent(true)
                // As the subtitle panel: no `.no_activate(true)`, which hides
                // every SpeakEase window while building (owner, 21/10).
                .hides_on_deactivate(false)
                .becomes_key_only_if_needed(true)
                .corner_radius(0.0)
                .style_mask(StyleMask::empty().borderless().nonactivating_panel())
                .with_window(|w| {
                    w.decorations(false)
                        .transparent(true)
                        .focusable(false)
                        .focused(false)
                        .visible(false)
                })
                .collection_behavior(
                    CollectionBehavior::new()
                        .can_join_all_spaces()
                        .full_screen_auxiliary(),
                )
                .build()
            {
                Ok(panel) => {
                    keep_out_of_screen_sharing(&handle);
                    panel.order_front_regardless();
                }
                Err(e) => log::error!("Meeting: cannot create the meeting bar: {e}"),
            }
        });
    }

    // SE-MEET-017 (not yet tested with Zoom, Meet or Teams)
    /// Asks macOS to leave the bar out of screenshots and screen sharing
    /// (`NSWindowSharingNone`); the user still sees it. Some capture tools
    /// ignore it.
    fn keep_out_of_screen_sharing(app: &AppHandle) {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        let Ok(pointer) = window.ns_window() else {
            return;
        };
        // SAFETY: the live NSWindow of this panel, on the main thread.
        unsafe {
            let ns_window = &*(pointer as *const AnyObject);
            let _: () = msg_send![ns_window, setSharingType: 0usize];
        }
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

/// Shows the bar while a meeting records or is being finished; hides it
/// otherwise. An error stays on it until the user closes it.
pub fn follow(app: &AppHandle, state: &MeetingState) {
    if state.phase != "idle" || state.error.is_some() {
        imp::show(app);
    } else {
        imp::hide(app);
    }
}
