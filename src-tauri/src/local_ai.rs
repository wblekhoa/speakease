//! SpeakEase on-device AI models (owner, 21/10): small GGUF models downloaded
//! on demand and run by the bundled llama.cpp server
//! (scripts/build-llama-server.sh, Contents/MacOS/llama-server), for subtitle
//! translation and the other AI features on Macs without Apple Intelligence.
//! One model per server process; the server starts on first use and stops
//! after the speech model's idle timeout. Plan and benchmark:
//! ai-memory/plans/on-device-ai-model.md.

use crate::managers::model::{HttpDownloadEvent, HttpDownloadOutcome, ModelManager};
use hf_hub::api::tokio::CancellationToken;
use log::{debug, info, warn};
use once_cell::sync::{Lazy, OnceCell};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// How long the server may take to load a model before we give up.
const START_TIMEOUT: Duration = Duration::from_secs(90);
/// The context the server keeps; subtitle prompts and clean-up fit easily.
const CONTEXT_TOKENS: &str = "8192";
/// Prompt states llama-server may keep in RAM besides the live context (MiB).
const PROMPT_CACHE_MB: &str = "256";

#[derive(Debug, Clone, Deserialize)]
struct CatalogEntry {
    id: String,
    name: String,
    family: String,
    parameters: String,
    repo: String,
    revision: String,
    filename: String,
    size_bytes: u64,
    sha256: String,
    ram_mb: u64,
    license: String,
    speed_score: u8,
    accuracy_score: u8,
    pick: Option<String>,
    heavy: bool,
}

#[derive(Deserialize)]
struct Catalog {
    models: Vec<CatalogEntry>,
}

static CATALOG: Lazy<Vec<CatalogEntry>> = Lazy::new(|| {
    serde_json::from_str::<Catalog>(include_str!("catalog/ai_models.json"))
        .map(|catalog| catalog.models)
        .unwrap_or_else(|e| {
            log::error!("On-device AI: bad catalog: {e}");
            Vec::new()
        })
});

/// A model file chosen for this run only (the subtitle probe), instead of the
/// one in settings.
static MODEL_OVERRIDE: OnceCell<PathBuf> = OnceCell::new();

/// The app, for code paths that only hold settings (post-processing).
static APP: OnceCell<AppHandle> = OnceCell::new();

/// Downloads in flight, by model id.
static DOWNLOADS: Lazy<Mutex<HashMap<String, CancellationToken>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

struct Server {
    child: Child,
    port: u16,
    model: PathBuf,
    last_used: Instant,
}

static SERVER: Lazy<Mutex<Option<Server>>> = Lazy::new(|| Mutex::new(None));

/// One on-device AI model as the AI page shows it.
#[derive(Debug, Clone, Serialize, Type)]
pub struct AiModelInfo {
    pub id: String,
    pub name: String,
    pub family: String,
    pub parameters: String,
    pub size_mb: u64,
    pub ram_mb: u64,
    pub license: String,
    pub speed_score: u8,
    pub accuracy_score: u8,
    /// "light", "balanced" or "best": its recommended slot.
    pub pick: Option<String>,
    /// Over 5 GB: listed for download, never recommended (owner, 21/10).
    pub heavy: bool,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_mb: u64,
    pub is_active: bool,
}

/// Whether this Mac can run on-device models at all (Apple silicon).
pub fn supported() -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

/// Called once at startup: remembers the app and stops a server left behind
/// by a crash (its model would otherwise sit in memory).
pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
    if let Some(binary) = server_binary() {
        let _ = Command::new("pkill")
            .arg("-f")
            .arg(binary.to_string_lossy().to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = crate::portable::app_data_dir(app)
        .map_err(|e| e.to_string())?
        .join("ai-models");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn entry(id: &str) -> Result<&'static CatalogEntry, String> {
    CATALOG
        .iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| format!("unknown model: {id}"))
}

fn model_path(app: &AppHandle, entry: &CatalogEntry) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(&entry.filename))
}

/// Every catalog model, with whether it is downloaded and in use.
pub fn list(app: &AppHandle) -> Vec<AiModelInfo> {
    let active = crate::settings::get_settings(app).local_ai_model;
    let downloading: Vec<String> = DOWNLOADS
        .lock()
        .map(|d| d.keys().cloned().collect())
        .unwrap_or_default();
    let dir = models_dir(app).ok();
    CATALOG
        .iter()
        .map(|entry| {
            let file = dir.as_ref().map(|d| d.join(&entry.filename));
            let is_downloaded = file.as_ref().is_some_and(|f| f.exists());
            let partial_mb = file
                .as_ref()
                .and_then(|f| fs::metadata(partial_of(f)).ok())
                .map(|m| m.len() / 1_048_576)
                .unwrap_or(0);
            AiModelInfo {
                id: entry.id.clone(),
                name: entry.name.clone(),
                family: entry.family.clone(),
                parameters: entry.parameters.clone(),
                size_mb: entry.size_bytes / 1_048_576,
                ram_mb: entry.ram_mb,
                license: entry.license.clone(),
                speed_score: entry.speed_score,
                accuracy_score: entry.accuracy_score,
                pick: entry.pick.clone(),
                heavy: entry.heavy,
                is_downloaded,
                is_downloading: downloading.contains(&entry.id),
                partial_mb,
                is_active: is_downloaded && active.as_deref() == Some(entry.id.as_str()),
            }
        })
        .collect()
}

fn partial_of(file: &std::path::Path) -> PathBuf {
    let mut name = file.as_os_str().to_owned();
    name.push(".partial");
    PathBuf::from(name)
}

/// This Mac's memory in GB, for the page's "fits this Mac" hint.
pub fn memory_gb() -> u64 {
    Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| text.trim().parse::<u64>().ok())
        .map(|bytes| bytes / 1_073_741_824)
        .unwrap_or(0)
}

#[derive(Clone, Serialize)]
struct DownloadFailed {
    model_id: String,
    error: String,
}

/// Downloads a model from its pinned revision, resuming a partial file and
/// checking its sha256 (the speech models' downloader). The first model
/// downloaded becomes the one in use.
pub async fn download(app: AppHandle, id: String) -> Result<(), String> {
    let entry = entry(&id)?;
    let token = {
        let mut downloads = DOWNLOADS.lock().map_err(|e| e.to_string())?;
        if downloads.contains_key(&id) {
            return Err("already downloading".to_string());
        }
        let token = CancellationToken::new();
        downloads.insert(id.clone(), token.clone());
        token
    };
    let _ = app.emit("ai-models-updated", ());
    let file = model_path(&app, entry)?;
    let partial = partial_of(&file);
    let url = format!(
        "https://huggingface.co/{}/resolve/{}/{}",
        entry.repo, entry.revision, entry.filename
    );
    let emitter = app.clone();
    let event_id = id.clone();
    let outcome = ModelManager::download_http_resumable_with_events(
        &id,
        &url,
        &partial,
        Some(entry.size_bytes),
        Some(&entry.sha256),
        &token,
        &move |event| {
            let _ = match event {
                HttpDownloadEvent::Progress(progress) => {
                    emitter.emit("ai-model-download-progress", progress)
                }
                HttpDownloadEvent::VerificationStarted => {
                    emitter.emit("ai-model-verification-started", &event_id)
                }
                HttpDownloadEvent::VerificationCompleted => {
                    emitter.emit("ai-model-verification-completed", &event_id)
                }
            };
        },
    )
    .await;
    if let Ok(mut downloads) = DOWNLOADS.lock() {
        downloads.remove(&id);
    }
    let result = match outcome {
        Ok(HttpDownloadOutcome::Completed) => {
            fs::rename(&partial, &file).map_err(|e| e.to_string())?;
            info!("On-device AI: downloaded {}", entry.name);
            let mut settings = crate::settings::get_settings(&app);
            if settings
                .local_ai_model
                .as_deref()
                .and_then(|active| entry_downloaded(&app, active))
                .is_none()
            {
                settings.local_ai_model = Some(id.clone());
                crate::settings::write_settings(&app, settings);
            }
            let _ = app.emit("ai-model-download-complete", &id);
            Ok(())
        }
        Ok(HttpDownloadOutcome::Cancelled) => {
            let _ = app.emit("ai-model-download-cancelled", &id);
            Ok(())
        }
        Err(e) => {
            let error = e.to_string();
            warn!("On-device AI: download of {} failed: {error}", entry.name);
            let _ = app.emit(
                "ai-model-download-failed",
                DownloadFailed {
                    model_id: id.clone(),
                    error: error.clone(),
                },
            );
            Err(error)
        }
    };
    let _ = app.emit("ai-models-updated", ());
    result
}

fn entry_downloaded(app: &AppHandle, id: &str) -> Option<PathBuf> {
    let entry = entry(id).ok()?;
    let path = model_path(app, entry).ok()?;
    path.exists().then_some(path)
}

pub fn cancel(id: &str) {
    if let Ok(downloads) = DOWNLOADS.lock() {
        if let Some(token) = downloads.get(id) {
            token.cancel();
        }
    }
}

/// Deletes a model's file (and any partial); stops the server first if it
/// is serving it.
pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    let entry = entry(id)?;
    let file = model_path(app, entry)?;
    stop_server_if(|model| model == file.as_path());
    let _ = fs::remove_file(partial_of(&file));
    if file.exists() {
        fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    let mut settings = crate::settings::get_settings(app);
    if settings.local_ai_model.as_deref() == Some(id) {
        settings.local_ai_model = None;
        crate::settings::write_settings(app, settings);
    }
    let _ = app.emit("ai-models-updated", ());
    Ok(())
}

/// Makes a downloaded model the one in use; the server switches on next use.
pub fn set_active(app: &AppHandle, id: &str) -> Result<(), String> {
    let file = entry_downloaded(app, id).ok_or_else(|| "not downloaded".to_string())?;
    stop_server_if(|model| model != file.as_path());
    let mut settings = crate::settings::get_settings(app);
    settings.local_ai_model = Some(id.to_string());
    crate::settings::write_settings(app, settings);
    let _ = app.emit("ai-models-updated", ());
    Ok(())
}

/// Uses `path` for this run instead of the model in settings (probe).
pub fn use_model_file(path: PathBuf) {
    let _ = MODEL_OVERRIDE.set(path);
}

/// The model in use, if it is downloaded.
pub fn active_model(app: &AppHandle) -> Option<PathBuf> {
    if let Some(path) = MODEL_OVERRIDE.get() {
        return path.exists().then(|| path.clone());
    }
    let id = crate::settings::get_settings(app).local_ai_model?;
    entry_downloaded(app, &id)
}

/// The bundled server: next to the app's executable, or the one
/// scripts/build-llama-server.sh made, in development.
fn server_binary() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join("llama-server");
    if beside.exists() {
        return Some(beside);
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries/llama-server");
    dev.exists().then_some(dev)
}

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .map_err(|e| format!("no free port: {e}"))
}

/// A plain HTTP GET of /health on the local server: true once the model is
/// loaded (llama-server answers 503 while loading).
fn healthy(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    if stream
        .write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut head = [0u8; 16];
    stream
        .read(&mut head)
        .is_ok_and(|n| head[..n].starts_with(b"HTTP/1.1 200"))
}

/// Everything after `-m <model>`. The prompt cache in RAM is capped: left at
/// llama-server's 8 GiB default it grew the process to 9-11 GB over one long
/// summary, far past the catalog's `ram_mb`.
fn server_flags(port: u16) -> Vec<String> {
    [
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "-ngl",
        "99",
        "-c",
        CONTEXT_TOKENS,
        "-np",
        "1",
        "--cache-ram",
        PROMPT_CACHE_MB,
        "--jinja",
        "--no-webui",
    ]
    .map(String::from)
    .to_vec()
}

/// Starts the server with the model in use (or keeps the one running) and
/// returns its port. Blocking: up to START_TIMEOUT while the model loads.
pub fn ensure_server(app: &AppHandle) -> Result<u16, String> {
    let model = active_model(app).ok_or_else(|| "no-local-model".to_string())?;
    let mut server = SERVER.lock().map_err(|e| e.to_string())?;
    if let Some(running) = server.as_mut() {
        let alive = matches!(running.child.try_wait(), Ok(None));
        if alive && running.model == model {
            running.last_used = Instant::now();
            return Ok(running.port);
        }
        let _ = running.child.kill();
        let _ = running.child.wait();
        *server = None;
    }
    let binary = server_binary().ok_or_else(|| "no-server: llama-server is missing".to_string())?;
    let port = free_port()?;
    let mut child = Command::new(&binary)
        .arg("-m")
        .arg(&model)
        .args(server_flags(port))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("server: cannot start: {e}"))?;
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                debug!("llama-server: {line}");
            }
        });
    }
    let started = Instant::now();
    while !healthy(port) {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("server: exited while loading ({status})"));
        }
        if started.elapsed() > START_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("server: the model did not load in time".to_string());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    info!(
        "On-device AI: server on port {port} with {} in {} ms",
        model.display(),
        started.elapsed().as_millis()
    );
    *server = Some(Server {
        child,
        port,
        model,
        last_used: Instant::now(),
    });
    drop(server);
    watch_idle(app.clone());
    Ok(port)
}

/// Stops the server once it has been idle for the speech model's unload
/// timeout (Never keeps it; Immediately means one minute here, as loading
/// takes seconds).
fn watch_idle(app: AppHandle) {
    static WATCHING: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut watching) = WATCHING.lock() {
        if *watching {
            return;
        }
        *watching = true;
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(20));
        let timeout = crate::settings::get_settings(&app)
            .model_unload_timeout
            .to_seconds()
            .map(|s| Duration::from_secs(s.max(60)));
        let Ok(mut server) = SERVER.lock() else {
            continue;
        };
        let idle = server
            .as_ref()
            .is_some_and(|s| timeout.is_some_and(|t| s.last_used.elapsed() > t));
        if idle {
            if let Some(mut running) = server.take() {
                info!("On-device AI: idle, stopping the server");
                let _ = running.child.kill();
                let _ = running.child.wait();
            }
        }
    });
}

fn stop_server_if(matches: impl Fn(&std::path::Path) -> bool) {
    if let Ok(mut server) = SERVER.lock() {
        if server.as_ref().is_some_and(|s| matches(&s.model)) {
            if let Some(mut running) = server.take() {
                let _ = running.child.kill();
                let _ = running.child.wait();
            }
        }
    }
}

/// Stops the server (app exit).
pub fn stop_server() {
    stop_server_if(|_| true);
}

/// Starts the server for the post-processing path, which holds settings but
/// no app handle; returns its OpenAI-compatible base URL.
pub async fn base_url() -> Result<String, String> {
    let app = APP.get().cloned().ok_or("not initialised")?;
    let port = tauri::async_runtime::spawn_blocking(move || ensure_server(&app))
        .await
        .map_err(|e| e.to_string())??;
    Ok(format!("http://127.0.0.1:{port}/v1"))
}

/// One chat turn with the on-device model: `system` as instructions, `user`
/// as the message; thinking off, as subtitles and clean-up need speed.
pub async fn chat(app: &AppHandle, system: &str, user: &str) -> Result<String, String> {
    let handle = app.clone();
    let port = tauri::async_runtime::spawn_blocking(move || ensure_server(&handle))
        .await
        .map_err(|e| e.to_string())??;
    let body = serde_json::json!({
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "temperature": 0.2,
        "max_tokens": 512,
        "cache_prompt": true,
        "chat_template_kwargs": { "enable_thinking": false },
    });
    let response = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .timeout(Duration::from_secs(60))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("server: {e}"))?;
    let status = response.status();
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("server: {status}: {json}"));
    }
    if let Ok(mut server) = SERVER.lock() {
        if let Some(running) = server.as_mut() {
            running.last_used = Instant::now();
        }
    }
    let text = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_string();
    if text.is_empty() {
        Err("empty answer".to_string())
    } else {
        Ok(text)
    }
}

/// [`chat`] for the subtitle threads, which are plain std threads.
pub fn chat_blocking(app: &AppHandle, system: &str, user: &str) -> Result<String, String> {
    tauri::async_runtime::block_on(chat(app, system, user))
}

#[cfg(test)]
mod tests {
    use super::*;

    // SE-AI-012
    #[test]
    fn catalog_parses_with_pins_and_picks() {
        assert!(CATALOG.len() >= 3);
        for entry in CATALOG.iter() {
            assert_eq!(entry.revision.len(), 40, "{} revision", entry.id);
            assert_eq!(entry.sha256.len(), 64, "{} sha256", entry.id);
            assert!(entry.filename.ends_with(".gguf"));
            // Owner, 21/10: over 5 GB is heavy and never recommended.
            let over_5gb = entry.size_bytes > 5_000_000_000 || entry.ram_mb > 5_000;
            assert_eq!(entry.heavy, over_5gb, "{} heavy flag", entry.id);
            assert!(
                !(entry.heavy && entry.pick.is_some()),
                "{} picked",
                entry.id
            );
        }
        for slot in ["light", "balanced", "best"] {
            assert_eq!(
                CATALOG
                    .iter()
                    .filter(|e| e.pick.as_deref() == Some(slot))
                    .count(),
                1,
                "one model in the {slot} slot"
            );
        }
    }

    // SE-AI-012
    #[test]
    fn server_caps_its_prompt_cache() {
        let flags = server_flags(8080);
        let at = flags
            .iter()
            .position(|f| f == "--cache-ram")
            .expect("--cache-ram");
        let mb: u64 = flags[at + 1].parse().expect("MiB");
        assert!(mb <= 512, "prompt cache {mb} MiB");
        assert!(flags.windows(2).any(|w| w == ["--port", "8080"]));
    }
}
