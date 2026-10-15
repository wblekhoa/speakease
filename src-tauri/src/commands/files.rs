//! SpeakEase: transcribe an audio or video file, or a link to one, and
//! rewrite or translate the result (docs/product/logic/files.md, SE-FILE-…).
//!
//! Only the sound is used. A video's audio track is decoded straight to
//! 16 kHz mono in memory - nothing is re-encoded (no MP3 step), and the
//! picture is never decoded. The result becomes a History entry like a
//! dictation, its audio kept as the same 16 kHz WAV a recording uses, so
//! it can be played back and re-transcribed.

use std::fs::File;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use log::{debug, info, warn};
use rodio::Source;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::audio_toolkit::audio::FrameResampler;
use crate::audio_toolkit::save_wav_file;
use crate::managers::history::{HistoryEntry, HistoryManager};
use crate::managers::transcription::TranscriptionManager;

/// One file job at a time; a second asks the first to finish.
static JOB_RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

/// Where a job is, for the Files page.
#[derive(Clone, Serialize, Type)]
pub struct FileProgress {
    /// "download", "read", "transcribe" or "enhance".
    pub phase: String,
    pub done: u32,
    pub total: u32,
}

fn report(app: &AppHandle, phase: &str, done: usize, total: usize) {
    let _ = app.emit(
        "file-progress",
        FileProgress {
            phase: phase.to_string(),
            done: done as u32,
            total: total.max(1) as u32,
        },
    );
}

struct JobGuard;
impl JobGuard {
    fn take() -> Result<Self, String> {
        if JOB_RUNNING.swap(true, Ordering::SeqCst) {
            return Err("busy".to_string());
        }
        CANCEL.store(false, Ordering::SeqCst);
        Ok(JobGuard)
    }
}
impl Drop for JobGuard {
    fn drop(&mut self) {
        JOB_RUNNING.store(false, Ordering::SeqCst);
    }
}

fn cancelled() -> Result<(), String> {
    if CANCEL.load(Ordering::SeqCst) {
        Err("cancelled".to_string())
    } else {
        Ok(())
    }
}

/// Stops the file job in progress (download, reading or transcription).
#[tauri::command]
#[specta::specta]
pub fn cancel_file_job(transcription_manager: State<'_, Arc<TranscriptionManager>>) {
    if JOB_RUNNING.load(Ordering::SeqCst) {
        CANCEL.store(true, Ordering::SeqCst);
        transcription_manager.cancel_transcription();
    }
}

// SE-FILE-001
/// Decodes the audio of `path` to 16 kHz mono. Containers and codecs are the
/// ones the bundled decoder reads: WAV, MP3, FLAC, Ogg Vorbis, and MP4 / M4A
/// / MOV with AAC. A video track is skipped, not decoded.
pub fn decode_to_16k_mono(path: &Path, on_progress: &dyn Fn(f64)) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|e| format!("open: {e}"))?;
    let byte_len = file.metadata().map(|m| m.len()).ok();
    let mut builder = rodio::Decoder::builder()
        .with_data(BufReader::with_capacity(1 << 20, file))
        .with_seekable(true)
        .with_gapless(true);
    if let Some(len) = byte_len {
        builder = builder.with_byte_len(len);
    }
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext = ext.to_ascii_lowercase();
        // QuickTime is the MP4 family to the decoder.
        let hint = if ext == "mov" { "mp4".to_string() } else { ext };
        builder = builder.with_hint(&hint);
    }
    let decoder = builder.build().map_err(|e| format!("unsupported: {e}"))?;

    let channels = decoder.channels().max(1) as usize;
    let rate = decoder.sample_rate().max(1) as usize;
    let expected = decoder
        .total_duration()
        .map(|d| d.as_secs_f64() * rate as f64 * channels as f64);

    let mut resampler = FrameResampler::new(rate, 16_000, Duration::from_millis(30));
    let mut out = Vec::with_capacity(
        expected
            .map(|n| (n / channels as f64 * 16_000.0 / rate as f64) as usize + 16_000)
            .unwrap_or(16_000 * 60),
    );
    let mut mono = Vec::with_capacity(8192);
    let (mut acc, mut ch, mut read) = (0.0f32, 0usize, 0usize);
    for sample in decoder {
        acc += sample;
        ch += 1;
        read += 1;
        if ch == channels {
            mono.push(acc / channels as f32);
            acc = 0.0;
            ch = 0;
            if mono.len() == 8192 {
                resampler.push(&mono, |frame| out.extend_from_slice(frame));
                mono.clear();
                cancelled()?;
                if let Some(total) = expected {
                    if read % (1 << 20) < 8192 * channels {
                        on_progress((read as f64 / total).min(1.0));
                    }
                }
            }
        }
    }
    resampler.push(&mono, |frame| out.extend_from_slice(frame));
    resampler.finish(|frame| out.extend_from_slice(frame));
    on_progress(1.0);
    if out.len() < 1_600 {
        return Err("no audio".to_string());
    }
    Ok(out)
}

// SE-FILE-004
/// Fetches a link's audio into `dir`: a page (YouTube and the like) through
/// yt-dlp when it is installed, asking only for the audio stream; a direct
/// link to a media file by plain download. Returns the file and a title.
async fn fetch_link(app: &AppHandle, url: &str, dir: &Path) -> Result<(PathBuf, String), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("bad link".to_string());
    }
    if !looks_like_media_file(url) {
        if let Some(ytdlp) = find_ytdlp() {
            return fetch_with_ytdlp(app, &ytdlp, url, dir).await;
        }
    }
    download_direct(app, url, dir).await
}

/// A link whose path ends in a media extension is downloaded as it is.
fn looks_like_media_file(url: &str) -> bool {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .to_ascii_lowercase();
    MEDIA_EXTENSIONS
        .iter()
        .any(|ext| path.ends_with(&format!(".{ext}")))
}

pub const MEDIA_EXTENSIONS: [&str; 9] = [
    "mp3", "m4a", "mp4", "mov", "wav", "flac", "ogg", "aac", "m4v",
];

fn find_ytdlp() -> Option<PathBuf> {
    ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
        .or_else(|| {
            Command::new("/usr/bin/which")
                .arg("yt-dlp")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
                .filter(|p| p.exists())
        })
}

async fn fetch_with_ytdlp(
    app: &AppHandle,
    ytdlp: &Path,
    url: &str,
    dir: &Path,
) -> Result<(PathBuf, String), String> {
    report(app, "download", 0, 1);
    let ytdlp = ytdlp.to_path_buf();
    let url = url.to_string();
    let dir = dir.to_path_buf();
    let output = tauri::async_runtime::spawn_blocking(move || {
        // The audio stream only, in a container the decoder reads (M4A/AAC
        // is what YouTube offers alongside Opus).
        let mut child = Command::new(&ytdlp)
            .args([
                "--no-playlist",
                "--no-progress",
                "-f",
                "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/best[ext=mp4]",
                "-o",
            ])
            .arg(dir.join("%(title).120B.%(ext)s"))
            .args(["--print", "after_move:filepath", "--", &url])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;
        // Cancel stops the download itself, not only what follows it.
        loop {
            if CANCEL.load(Ordering::SeqCst) {
                let _ = child.kill();
                break;
            }
            if child.try_wait()?.is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(150));
        }
        child.wait_with_output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| {
        warn!("yt-dlp could not run: {e}");
        "download failed".to_string()
    })?;
    cancelled()?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        warn!("yt-dlp failed: {}", err.lines().last().unwrap_or_default());
        return Err("download failed".to_string());
    }
    let path = PathBuf::from(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .last()
            .unwrap_or_default()
            .trim(),
    );
    if !path.exists() {
        return Err("download failed".to_string());
    }
    let title = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    report(app, "download", 1, 1);
    Ok((path, title))
}

async fn download_direct(
    app: &AppHandle,
    url: &str,
    dir: &Path,
) -> Result<(PathBuf, String), String> {
    use futures_util::StreamExt;
    let response = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|_| "download failed".to_string())?;
    if !response.status().is_success() {
        return Err("download failed".to_string());
    }
    let kind = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if kind.starts_with("text/html") {
        // A web page, not a file: only yt-dlp can get the audio out of it.
        return Err("needs yt-dlp".to_string());
    }
    let name = url
        .split(['?', '#'])
        .next()
        .and_then(|p| p.rsplit('/').next())
        .filter(|n| !n.is_empty())
        .unwrap_or("download")
        .to_string();
    let total = response.content_length().unwrap_or(0) as usize;
    let path = dir.join(&name);
    let mut file = File::create(&path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut got = 0usize;
    while let Some(chunk) = stream.next().await {
        cancelled()?;
        let chunk = chunk.map_err(|_| "download failed".to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        got += chunk.len();
        report(app, "download", got, total.max(got));
    }
    let title = Path::new(&name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or(name);
    Ok((path, title))
}

/// What the Files page hands over: a file on disk, or a link.
#[derive(Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum MediaSource {
    Path(String),
    Url(String),
}

// SE-FILE-002
/// Transcribes a file or a link's audio into a new History entry, reporting
/// `file-progress` as it goes. Errors are short codes the page translates:
/// busy, cancelled, unsupported, no audio, no speech, bad link, download
/// failed, needs yt-dlp, no model.
#[tauri::command]
#[specta::specta]
pub async fn transcribe_media(
    app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    source: MediaSource,
) -> Result<HistoryEntry, String> {
    let _job = JobGuard::take()?;
    let started = std::time::Instant::now();

    let scratch = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join(format!("media-{}", chrono::Utc::now().timestamp_millis()));
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let result = async {
        let (path, title) = match source {
            MediaSource::Path(path) => {
                let path = PathBuf::from(path);
                let title = path
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                (path, title)
            }
            MediaSource::Url(url) => fetch_link(&app, url.trim(), &scratch).await?,
        };

        // The model loads while the file is read.
        transcription_manager.initiate_model_load();
        report(&app, "read", 0, 1000);
        let progress_app = app.clone();
        let decode_path = path.clone();
        let samples = tauri::async_runtime::spawn_blocking(move || {
            decode_to_16k_mono(&decode_path, &|f| {
                report(&progress_app, "read", (f * 1000.0) as usize, 1000)
            })
        })
        .await
        .map_err(|e| e.to_string())??;
        let audio_secs = samples.len() as f64 / 16_000.0;
        debug!(
            "Read {:.1}s of audio in {:?}",
            audio_secs,
            started.elapsed()
        );

        let file_name = format!("file-{}.wav", chrono::Utc::now().timestamp_millis());
        let wav_path = history_manager.get_audio_file_path(&file_name);
        let to_save = samples.clone();
        let saved =
            tauri::async_runtime::spawn_blocking(move || save_wav_file(&wav_path, &to_save));

        let tm = Arc::clone(&transcription_manager);
        let progress_app = app.clone();
        let transcribed = tauri::async_runtime::spawn_blocking(move || {
            tm.transcribe_reporting(samples, &|done, total| {
                report(&progress_app, "transcribe", done, total)
            })
        })
        .await;
        // The audio is kept only with an entry: never leave a WAV behind.
        let written = match saved.await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e.to_string()),
            Err(e) => Err(e.to_string()),
        };
        let text = match transcribed {
            Ok(Ok(text)) => Ok(text),
            Ok(Err(e)) if CANCEL.load(Ordering::SeqCst) => Err(format!("cancelled: {e}")),
            Ok(Err(e)) if e.to_string().contains("not loaded") => Err("no model".to_string()),
            Ok(Err(e)) => Err(e.to_string()),
            Err(e) => Err(e.to_string()),
        };
        let text = match (text, written) {
            (Ok(text), Ok(())) if !text.trim().is_empty() => text,
            (text, written) => {
                let _ = std::fs::remove_file(history_manager.get_audio_file_path(&file_name));
                return Err(match (text, written) {
                    (Err(code), _) => code,
                    (Ok(_), Err(err)) => err,
                    (Ok(_), Ok(())) => "no speech".to_string(),
                });
            }
        };
        info!(
            "File of {:.0}s transcribed in {:.1}s",
            audio_secs,
            started.elapsed().as_secs_f64()
        );
        history_manager
            .save_titled_entry(file_name, title, text)
            .map_err(|e| e.to_string())
    }
    .await;
    let _ = std::fs::remove_dir_all(&scratch);
    if CANCEL.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    result
}

/// What to do with an entry's text.
#[derive(Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum Enhancement {
    /// A prompt id from AI & Translate's prompts.
    Prompt(String),
    /// A translate target, as on the Speak page ("English", "Japanese"…).
    Translate(String),
}

/// Pieces the AI would not process, kept in their original words.
#[derive(Clone, Serialize, Type)]
pub struct EnhanceKept {
    pub kept: u32,
    pub total: u32,
}

/// The longest piece of text sent to the AI in one request: Apple
/// Intelligence on the Mac reads a few thousand tokens at most, and
/// Vietnamese runs to more tokens per character than English.
const AI_PIECE_CHARS: usize = 1_200;

// SE-FILE-003
/// Rewrites or translates an entry's original text, a piece at a time so a
/// long transcript fits the AI, and stores the result as its AI version.
#[tauri::command]
#[specta::specta]
pub async fn enhance_history_entry(
    app: AppHandle,
    history_manager: State<'_, Arc<HistoryManager>>,
    id: i64,
    enhancement: Enhancement,
) -> Result<HistoryEntry, String> {
    let _job = JobGuard::take()?;
    let settings = crate::settings::get_settings(&app);
    if !settings.post_process_enabled {
        return Err("ai off".to_string());
    }
    let entry = history_manager
        .get_entry_by_id(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "not found".to_string())?;
    let steps = match &enhancement {
        Enhancement::Prompt(id) => vec![id.clone()],
        Enhancement::Translate(target) => crate::settings::translation_steps(target),
    };
    let pieces = split_for_ai(&entry.transcription_text, AI_PIECE_CHARS);
    let total = pieces.len() * steps.len();
    report(&app, "enhance", 0, total);
    let mut out = Vec::with_capacity(pieces.len());
    let mut done = 0;
    // A piece the AI refuses (Apple Intelligence's guardrails, a provider
    // error) keeps its original words; the rest carry on. Only when every
    // piece fails does the job fail (owner's log, 14/10: one refusal used to
    // throw away a whole long translation).
    let mut kept = 0;
    let pieces_total = pieces.len();
    for piece in pieces {
        let mut text = piece.clone();
        let mut refused = false;
        for step in &steps {
            cancelled()?;
            if !refused {
                match crate::actions::post_process_transcription(&settings, &text, Some(step)).await
                {
                    Some(next) => text = next,
                    None => refused = true,
                }
            }
            done += 1;
            report(&app, "enhance", done, total);
        }
        if refused {
            kept += 1;
            text = piece;
        }
        out.push(text.trim().to_string());
    }
    if kept == pieces_total {
        return Err("ai failed".to_string());
    }
    if kept > 0 {
        let _ = app.emit(
            "enhance-kept-original",
            EnhanceKept {
                kept: kept as u32,
                total: pieces_total as u32,
            },
        );
    }
    let label = match &enhancement {
        Enhancement::Prompt(id) => settings.prompt_text(id),
        Enhancement::Translate(target) => steps
            .last()
            .and_then(|s| settings.prompt_text(s))
            .or(Some(target.clone())),
    };
    history_manager
        .update_transcription(id, entry.transcription_text, Some(out.join("\n\n")), label)
        .map_err(|e| e.to_string())
}

/// Writes text to a file the person picked in a Save dialog.
#[tauri::command]
#[specta::specta]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Splits text into pieces of at most `max` characters, at sentence ends
/// where it can and at spaces where a sentence is longer than that. Joining
/// the pieces with spaces gives back the text's words in order.
pub fn split_for_ai(text: &str, max: usize) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut current = String::new();
    let flush = |current: &mut String, pieces: &mut Vec<String>| {
        if !current.trim().is_empty() {
            pieces.push(current.trim().to_string());
        }
        current.clear();
    };
    for sentence in sentences(text) {
        if sentence.chars().count() > max {
            flush(&mut current, &mut pieces);
            for word in sentence.split_whitespace() {
                if current.chars().count() + word.chars().count() + 1 > max {
                    flush(&mut current, &mut pieces);
                }
                if !current.is_empty() {
                    current.push(' ');
                }
                current.push_str(word);
            }
            continue;
        }
        if current.chars().count() + sentence.chars().count() + 1 > max {
            flush(&mut current, &mut pieces);
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(sentence.trim());
    }
    flush(&mut current, &mut pieces);
    pieces
}

fn sentences(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    for (i, (at, c)) in chars.iter().enumerate() {
        let end_mark = matches!(c, '.' | '!' | '?' | '…' | '\n');
        let next_is_space = chars
            .get(i + 1)
            .map(|(_, n)| n.is_whitespace())
            .unwrap_or(true);
        if end_mark && next_is_space {
            let end = at + c.len_utf8();
            if !text[start..end].trim().is_empty() {
                out.push(&text[start..end]);
            }
            start = end;
        }
    }
    if !text[start..].trim().is_empty() {
        out.push(&text[start..]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // SE-FILE-003
    #[test]
    fn long_text_splits_at_sentences_and_keeps_every_word() {
        let sentence = "Mình chia nội dung thành ba phần rõ ràng. ";
        let text = sentence.repeat(100);
        let pieces = split_for_ai(&text, 200);
        assert!(pieces.len() > 1);
        assert!(pieces.iter().all(|p| p.chars().count() <= 200));
        assert!(pieces.iter().all(|p| p.ends_with('.')));
        let words: Vec<&str> = text.split_whitespace().collect();
        let joined = pieces.join(" ");
        assert_eq!(joined.split_whitespace().collect::<Vec<_>>(), words);
    }

    #[test]
    fn a_sentence_longer_than_a_piece_splits_at_spaces() {
        let text = "từ ".repeat(300);
        let pieces = split_for_ai(&text, 100);
        assert!(pieces.iter().all(|p| p.chars().count() <= 100));
        assert_eq!(pieces.join(" ").split_whitespace().count(), 300);
        assert_eq!(split_for_ai("", 100), Vec::<String>::new());
        assert_eq!(
            split_for_ai("Ngắn thôi.", 100),
            vec!["Ngắn thôi.".to_string()]
        );
    }

    // SE-FILE-001
    #[test]
    fn stereo_44k_audio_becomes_16k_mono_of_the_same_length() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("stereo.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44_100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).expect("writer");
        for i in 0..44_100 * 3 {
            let tone =
                ((i as f32 * 440.0 * std::f32::consts::TAU / 44_100.0).sin() * 8_000.0) as i16;
            writer.write_sample(tone).expect("left");
            writer.write_sample(tone).expect("right");
        }
        writer.finalize().expect("finalize");

        let samples = decode_to_16k_mono(&path, &|_| {}).expect("decode");
        let secs = samples.len() as f64 / 16_000.0;
        assert!((secs - 3.0).abs() < 0.05, "got {secs} s");
        let peak = samples.iter().fold(0.0f32, |m, x| m.max(x.abs()));
        assert!(peak > 0.2 && peak < 0.3, "tone level kept, got {peak}");
    }

    #[test]
    fn a_file_that_is_not_audio_is_refused() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("notes.mp3");
        std::fs::write(&path, "not audio at all").expect("write");
        assert!(decode_to_16k_mono(&path, &|_| {}).is_err());
    }

    // SE-FILE-004
    #[test]
    fn media_links_are_told_apart_from_pages() {
        assert!(looks_like_media_file(
            "https://cdn.example.com/a/talk.MP3?x=1"
        ));
        assert!(looks_like_media_file("https://example.com/v.mov#t=3"));
        assert!(!looks_like_media_file(
            "https://www.youtube.com/watch?v=abc"
        ));
        assert!(!looks_like_media_file("https://youtu.be/abc"));
    }
}
