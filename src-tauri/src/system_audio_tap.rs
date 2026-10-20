//! SpeakEase: one app's sound, heard through a Core Audio process tap
//! (`swift/system_audio_tap.swift`, macOS 14.2+), for live subtitles.
//! Elsewhere every call reports the tap as unavailable.

use serde::Deserialize;
use std::sync::mpsc::Receiver;
use std::time::Instant;

/// A process Core Audio knows about, as the tap sees it.
#[derive(Debug, Clone, Deserialize)]
pub struct AudioProcess {
    pub pid: i32,
    pub bundle_id: String,
    /// The app responsible for the process (a helper's host app).
    #[serde(default)]
    pub app_bundle_id: String,
    /// Sending sound to an output right now.
    pub playing: bool,
}

/// Mono samples at the tap's own rate, stamped when they arrived.
pub struct TapChunk {
    pub samples: Vec<f32>,
    pub sample_rate: f64,
    pub arrived: Instant,
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod imp {
    use super::{AudioProcess, TapChunk};
    use std::ffi::{c_char, c_void, CStr, CString};
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::time::Instant;

    type TapCallback = extern "C" fn(*mut c_void, *const f32, u32, f64);

    extern "C" {
        fn se_tap_available() -> i32;
        fn se_tap_list_processes() -> *mut c_char;
        fn se_tap_start(
            bundle: *const c_char,
            mute: i32,
            callback: TapCallback,
            context: *mut c_void,
            error_out: *mut *mut c_char,
        ) -> i64;
        fn se_tap_stop(handle: i64);
        fn se_tap_free_string(pointer: *mut c_char);
    }

    fn take_string(pointer: *mut c_char) -> String {
        if pointer.is_null() {
            return String::new();
        }
        let text = unsafe { CStr::from_ptr(pointer) }
            .to_string_lossy()
            .into_owned();
        unsafe { se_tap_free_string(pointer) };
        text
    }

    extern "C" fn on_audio(context: *mut c_void, samples: *const f32, frames: u32, rate: f64) {
        if context.is_null() || samples.is_null() || frames == 0 {
            return;
        }
        let sender = unsafe { &*(context as *const Sender<TapChunk>) };
        let samples = unsafe { std::slice::from_raw_parts(samples, frames as usize) }.to_vec();
        let _ = sender.send(TapChunk {
            samples,
            sample_rate: rate,
            arrived: Instant::now(),
        });
    }

    pub struct AppTap {
        handle: i64,
        // Owned here so the pointer handed to Swift outlives the tap.
        sender: *mut Sender<TapChunk>,
    }

    // The raw pointer is only freed in Drop, after Swift has stopped calling.
    unsafe impl Send for AppTap {}

    impl Drop for AppTap {
        fn drop(&mut self) {
            unsafe {
                se_tap_stop(self.handle);
                drop(Box::from_raw(self.sender));
            }
        }
    }

    pub fn available() -> bool {
        unsafe { se_tap_available() == 1 }
    }

    pub fn list_processes() -> Vec<AudioProcess> {
        let json = take_string(unsafe { se_tap_list_processes() });
        serde_json::from_str(&json).unwrap_or_default()
    }

    pub fn start(bundle_id: &str, mute: bool) -> Result<(AppTap, Receiver<TapChunk>), String> {
        let bundle = CString::new(bundle_id).map_err(|e| e.to_string())?;
        let (sender, receiver) = channel();
        let sender = Box::into_raw(Box::new(sender));
        let mut error: *mut c_char = std::ptr::null_mut();
        let handle = unsafe {
            se_tap_start(
                bundle.as_ptr(),
                mute as i32,
                on_audio,
                sender as *mut c_void,
                &mut error,
            )
        };
        if handle == 0 {
            unsafe { drop(Box::from_raw(sender)) };
            return Err(take_string(error));
        }
        Ok((AppTap { handle, sender }, receiver))
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
mod imp {
    use super::{AudioProcess, TapChunk};
    use std::sync::mpsc::Receiver;

    pub struct AppTap;

    pub fn available() -> bool {
        false
    }

    pub fn list_processes() -> Vec<AudioProcess> {
        Vec::new()
    }

    pub fn start(_bundle_id: &str, _mute: bool) -> Result<(AppTap, Receiver<TapChunk>), String> {
        Err("unsupported: process taps need macOS 14.2".to_string())
    }
}

pub use imp::AppTap;

/// Whether this Mac can tap an app's sound (macOS 14.2+ on Apple silicon).
pub fn available() -> bool {
    imp::available()
}

/// Every process Core Audio knows about, playing or not, except SpeakEase.
pub fn list_processes() -> Vec<AudioProcess> {
    imp::list_processes()
}

/// Starts hearing `bundle_id` and its helper processes; `mute` silences the
/// app on the speakers while it is tapped (tests). Sound stops when the
/// returned tap is dropped.
pub fn start(bundle_id: &str, mute: bool) -> Result<(AppTap, Receiver<TapChunk>), String> {
    imp::start(bundle_id, mute)
}
