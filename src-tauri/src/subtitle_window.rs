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
/// From the bottom-right corner of the visible area.
const BOTTOM_GAP: f64 = 8.0;
const SIDE_GAP: f64 = 8.0;

#[cfg(target_os = "macos")]
mod imp {
    use super::{BOTTOM_GAP, HEIGHT, LABEL, SIDE_GAP, WIDTH};
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
                .no_activate(true)
                .hides_on_deactivate(false)
                .becomes_key_only_if_needed(true)
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
                Ok(panel) => {
                    prevent_activation(&handle);
                    frost(&handle);
                    panel.order_front_regardless();
                }
                Err(e) => log::error!("Live subtitles: cannot create the subtitle panel: {e}"),
            }
        });
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

    /// A native blur behind the bubbles (owner, 20/10: easier to read over a
    /// busy video), shaped as a gradient: full behind the newest lines,
    /// fading out toward the top and at the sides, so no box edge shows
    /// (owner, 20/10: no box around the list). macOS draws it from the
    /// window behind, which web content cannot reach; it stays on although
    /// the panel never takes focus, and follows light or dark.
    fn frost(app: &AppHandle) {
        use tauri::utils::config::WindowEffectsConfig;
        use tauri::window::{Effect, EffectState};
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        let frosted = window.set_effects(WindowEffectsConfig {
            effects: vec![Effect::Popover],
            state: Some(EffectState::Active),
            radius: None,
            color: None,
        });
        if let Err(e) = frosted {
            log::warn!("Live subtitles: no blur behind the panel: {e}");
            return;
        }
        if let Ok(pointer) = window.ns_window() {
            // SAFETY: the live NSWindow of this panel, on the main thread.
            unsafe { fade_blur_edges(pointer) };
        }
    }

    /// The blur's fade, in points: from the top, from the bottom, at each side.
    const FADE_TOP: usize = 72;
    const FADE_BOTTOM: usize = 14;
    const FADE_SIDE: usize = 14;
    /// The tag window-vibrancy gives the blur view it adds.
    const BLUR_VIEW_TAG: isize = 91_376_254;

    /// Masks the blur view with a gradient image. Its cap insets cover the
    /// fades and the one-point middle stretches, so the mask fits whatever
    /// height the panel takes as lines come and go.
    unsafe fn fade_blur_edges(ns_window: *mut std::ffi::c_void) {
        use objc2::runtime::{AnyObject, Bool};
        use objc2::{class, msg_send};
        use objc2_foundation::{NSEdgeInsets, NSSize, NSString};

        let ns_window = &*(ns_window as *const AnyObject);
        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if content.is_null() {
            return;
        }
        let blur: *mut AnyObject = msg_send![content, viewWithTag: BLUR_VIEW_TAG];
        if blur.is_null() {
            log::warn!("Live subtitles: blur view not found, its edges stay hard");
            return;
        }

        let alpha = blur_mask_alpha();
        let (width, height) = (FADE_SIDE * 2 + 1, FADE_TOP + FADE_BOTTOM + 1);
        let rep: *mut AnyObject = msg_send![class!(NSBitmapImageRep), alloc];
        let color_space = NSString::from_str("NSDeviceRGBColorSpace");
        let rep: *mut AnyObject = msg_send![rep,
            initWithBitmapDataPlanes: std::ptr::null_mut::<*mut u8>(),
            pixelsWide: width as isize,
            pixelsHigh: height as isize,
            bitsPerSample: 8isize,
            samplesPerPixel: 4isize,
            hasAlpha: Bool::YES,
            isPlanar: Bool::NO,
            colorSpaceName: &*color_space,
            bytesPerRow: (width * 4) as isize,
            bitsPerPixel: 32isize];
        if rep.is_null() {
            return;
        }
        let pixels: *mut u8 = msg_send![rep, bitmapData];
        if !pixels.is_null() {
            // Premultiplied black: only the alpha matters to a mask.
            for (i, a) in alpha.iter().enumerate() {
                let px = pixels.add(i * 4);
                *px = 0;
                *px.add(1) = 0;
                *px.add(2) = 0;
                *px.add(3) = *a;
            }
        }
        let size = NSSize::new(width as f64, height as f64);
        let image: *mut AnyObject = msg_send![class!(NSImage), alloc];
        let image: *mut AnyObject = msg_send![image, initWithSize: size];
        if image.is_null() {
            let _: () = msg_send![rep, release];
            return;
        }
        let _: () = msg_send![image, addRepresentation: rep];
        let _: () = msg_send![rep, release];
        let insets = NSEdgeInsets {
            top: FADE_TOP as f64,
            left: FADE_SIDE as f64,
            bottom: FADE_BOTTOM as f64,
            right: FADE_SIDE as f64,
        };
        let _: () = msg_send![image, setCapInsets: insets];
        // NSImageResizingModeStretch
        let _: () = msg_send![image, setResizingMode: 1isize];
        let _: () = msg_send![blur, setMaskImage: image];
        let _: () = msg_send![image, release];
    }

    /// The mask's alpha, rows from the top: an eased fade in from each edge.
    fn blur_mask_alpha() -> Vec<u8> {
        let (width, height) = (FADE_SIDE * 2 + 1, FADE_TOP + FADE_BOTTOM + 1);
        let ease = |distance: f64, span: usize| {
            let t = (distance / span as f64).clamp(0.0, 1.0);
            t * t * (3.0 - 2.0 * t)
        };
        let mut alpha = Vec::with_capacity(width * height);
        for y in 0..height {
            let from_top = y as f64 + 0.5;
            let from_bottom = (height - y) as f64 - 0.5;
            let vertical = ease(from_top, FADE_TOP).min(ease(from_bottom, FADE_BOTTOM));
            for x in 0..width {
                let from_side = (x as f64 + 0.5).min((width - x) as f64 - 0.5);
                let a = vertical * ease(from_side, FADE_SIDE);
                alpha.push((a * 255.0).round() as u8);
            }
        }
        alpha
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
