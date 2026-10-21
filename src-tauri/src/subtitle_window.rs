//! SpeakEase live subtitles: the floating panel of subtitle bubbles (owner,
//! 20/10: a chat-like column instead of one bar line). A non-activating panel
//! like the recording pill, so the app being watched keeps focus; it opens in
//! the bottom-right corner and can be dragged.

use tauri::AppHandle;

pub const LABEL: &str = "live_subtitles";
/// 440 of bubbles plus 16 each side for their shadows.
const WIDTH: f64 = 472.0;
/// The opening height; the bar's page then fits the window to its card,
/// keeping the bottom edge, so no empty glass blocks the video above it.
const HEIGHT: f64 = 150.0;
/// The blurred panel's corners (LiveSubtitles.css --ls-panel-radius).
const RADIUS: f64 = 26.0;
/// From the bottom-right corner of the visible area.
const BOTTOM_GAP: f64 = 8.0;
const SIDE_GAP: f64 = 8.0;

#[cfg(target_os = "macos")]
mod imp {
    use super::{BOTTOM_GAP, HEIGHT, LABEL, RADIUS, SIDE_GAP, WIDTH};
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tauri_nspanel::{
        tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask,
    };

    tauri_panel! {
        panel!(SubtitlePanel {
            config: {
                can_become_key_window: false,
                is_floating_panel: true
            }
        })
    }

    fn bottom_right(app: &AppHandle) -> Option<(f64, f64)> {
        let monitor = crate::overlay::get_monitor_with_cursor(app)?;
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let x = (area.position.x as f64 + area.size.width as f64) / scale - WIDTH - SIDE_GAP;
        let y = (area.position.y as f64 + area.size.height as f64) / scale - HEIGHT - BOTTOM_GAP;
        Some((x, y))
    }

    /// Shows the panel above every other window, creating it on first use
    /// (owner, 20/10: subtitles come to the front when they start). A panel
    /// the user dragged stays where they left it (its page remembers the
    /// spot).
    pub fn show(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            unhide_app();
            if let Ok(panel) = handle.get_webview_panel(LABEL) {
                panel.set_level(PanelLevel::Status.value());
                panel.order_front_regardless();
                return;
            }
            let Some((x, y)) = bottom_right(&handle) else {
                log::warn!("Live subtitles: no monitor for the subtitle panel");
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
                // Not `.no_activate(true)`: it flips the app to the
                // Prohibited policy while building, which hides every
                // SpeakEase window, this panel too, until the Dock icon is
                // clicked (owner, 21/10). The nonactivating style, an
                // unfocusable window and `prevent_activation` keep focus away.
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
                    prevent_activation(&handle);
                    frost(&handle);
                    panel.order_front_regardless();
                }
                Err(e) => log::error!("Live subtitles: cannot create the subtitle panel: {e}"),
            }
        });
    }

    /// An app hidden by macOS (Cmd-H, or a policy change) keeps its panels
    /// hidden whatever their level; bring it back without taking focus
    /// from the app being watched.
    fn unhide_app() {
        use objc2::runtime::{AnyObject, Bool};
        use objc2::{class, msg_send};
        // SAFETY: NSApplication's shared instance, on the main thread.
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            if ns_app.is_null() {
                return;
            }
            let hidden: Bool = msg_send![ns_app, isHidden];
            if hidden.as_bool() {
                let _: () = msg_send![ns_app, unhideWithoutActivation];
            }
        }
    }

    /// A click on the panel (a switch, ×, a drag) must not activate
    /// SpeakEase and raise its main window over the video (owner, 20/10).
    /// The nonactivating style alone does not stop it on a window made
    /// before it became a panel; AppKit's `_setPreventsActivation:` does.
    /// Checked first, so a macOS without it only loses this nicety.
    fn prevent_activation(app: &AppHandle) {
        use objc2::runtime::{AnyObject, Bool};
        use objc2::{msg_send, sel};
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        let Ok(pointer) = window.ns_window() else {
            return;
        };
        // SAFETY: `ns_window` is the live NSWindow of this panel, used on the
        // main thread (`show` runs here through run_on_main_thread).
        unsafe {
            let ns_window = &*(pointer as *const AnyObject);
            let selector = sel!(_setPreventsActivation:);
            let responds: Bool = msg_send![ns_window, respondsToSelector: selector];
            if responds.as_bool() {
                let _: () = msg_send![ns_window, _setPreventsActivation: Bool::YES];
            } else {
                log::warn!(
                    "Live subtitles: this macOS cannot keep the panel from activating the app"
                );
            }
        }
    }

    /// A strong native blur behind the whole panel (owner, 20/10: easier to
    /// read over a busy video). macOS draws it from the window behind, which
    /// web content cannot reach; it stays on although the panel never takes
    /// focus, and follows light or dark.
    fn frost(app: &AppHandle) {
        use tauri::utils::config::WindowEffectsConfig;
        use tauri::window::{Effect, EffectState};
        if let Some(window) = app.get_webview_window(LABEL) {
            let frosted = window.set_effects(WindowEffectsConfig {
                effects: vec![Effect::Popover],
                state: Some(EffectState::Active),
                radius: Some(RADIUS),
                color: None,
            });
            if let Err(e) = frosted {
                log::warn!("Live subtitles: no blur behind the panel: {e}");
            }
        }
    }

    /// Sets the panel's height in one step, its bottom edge kept (AppKit's
    /// origin is the bottom-left corner). Resizing then moving from the page
    /// showed a frame between the two, so the bubbles jumped (owner, 21/10).
    pub fn fit_height(app: &AppHandle, height: f64) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            use objc2::msg_send;
            use objc2::runtime::{AnyObject, Bool};
            use objc2_foundation::NSRect;
            let Some(window) = handle.get_webview_window(LABEL) else {
                return;
            };
            let Ok(pointer) = window.ns_window() else {
                return;
            };
            // SAFETY: the live NSWindow of this panel, on the main thread.
            unsafe {
                let ns_window = &*(pointer as *const AnyObject);
                let mut frame: NSRect = msg_send![ns_window, frame];
                if (frame.size.height - height).abs() < 1.0 {
                    return;
                }
                frame.size.height = height;
                let _: () = msg_send![ns_window, setFrame: frame, display: Bool::YES];
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
    pub fn fit_height(_app: &AppHandle, _height: f64) {}
}

pub fn show(app: &AppHandle) {
    imp::show(app)
}

pub fn hide(app: &AppHandle) {
    imp::hide(app)
}

/// The panel's height in points, its bottom edge kept.
pub fn fit_height(app: &AppHandle, height: f64) {
    imp::fit_height(app, height)
}
