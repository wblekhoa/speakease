use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug, Clone, Default)]
#[command(name = "handy", about = "Handy - Speech to Text")]
pub struct CliArgs {
    /// Start with the main window hidden
    #[arg(long)]
    pub start_hidden: bool,

    /// Disable the system tray icon
    #[arg(long)]
    pub no_tray: bool,

    /// Toggle transcription on/off (sent to running instance)
    #[arg(long)]
    pub toggle_transcription: bool,

    /// Toggle transcription with post-processing on/off (sent to running instance)
    #[arg(long)]
    pub toggle_post_process: bool,

    /// Cancel the current operation (sent to running instance)
    #[arg(long)]
    pub cancel: bool,

    /// Enable debug mode with verbose logging
    #[arg(long)]
    pub debug: bool,

    /// Transcribe this WAV (16 kHz mono), or any audio/video file the Files
    /// page reads (MP3, M4A, MP4, MOV…), headlessly and exit. Runs the same
    /// batch transcription path as the app — no mic, no VAD, no download
    /// (the model must already be installed).
    #[arg(short = 'f', long, value_name = "WAV")]
    pub transcribe_file: Option<PathBuf>,

    /// Model id to load for --transcribe-file (default: the selected model).
    #[arg(long)]
    pub model: Option<String>,

    /// Hard-select the compute device for --transcribe-file by its registry
    /// index (see --list-devices). Omit to use the persisted accelerator
    /// setting. transcribe-cpp (whisper-family) models only.
    #[arg(long, value_name = "N")]
    pub device_index: Option<usize>,

    /// List the transcribe-cpp compute devices (with indices) and exit.
    #[arg(long)]
    pub list_devices: bool,

    /// List the available models (with ids) and exit. Pass an id to --model.
    /// Honors --json for machine-readable output.
    #[arg(long)]
    pub list_models: bool,

    /// Repeat the transcription N times (best_ms reports the fastest run).
    #[arg(long, value_name = "N")]
    pub repeat: Option<usize>,

    /// Emit --transcribe-file results as JSON.
    #[arg(long)]
    pub json: bool,

    /// SpeakEase live subtitles, Phase 0: tap this app's sound (bundle id),
    /// recognise and translate each sentence headlessly, and write one JSON
    /// line per sentence to --probe-out. Needs macOS 14.2+.
    #[arg(long, value_name = "BUNDLE_ID", hide = true)]
    pub live_subtitle_probe: Option<String>,

    /// How long --live-subtitle-probe listens (default 120 s).
    #[arg(long, value_name = "SECONDS", hide = true)]
    pub probe_seconds: Option<u64>,

    /// Where --live-subtitle-probe writes its JSON lines.
    #[arg(long, value_name = "FILE", hide = true)]
    pub probe_out: Option<PathBuf>,

    /// Also run the once-a-second partial recognitions the app runs, to
    /// measure their load during --live-subtitle-probe.
    #[arg(long, hide = true)]
    pub probe_partials: bool,

    /// Translate with "apple" (Apple Intelligence, default), "local" (the
    /// on-device model in use) or "local=<model.gguf>" during
    /// --live-subtitle-probe.
    #[arg(long, value_name = "TRANSLATOR", hide = true)]
    pub probe_translator: Option<String>,

    /// Silence the tapped app on the speakers during --live-subtitle-probe.
    #[arg(long, hide = true)]
    pub probe_mute: bool,

    /// Language the tapped app speaks (default English).
    #[arg(long, value_name = "LANGUAGE", hide = true)]
    pub subtitle_from: Option<String>,

    /// Language the subtitles are written in (default Vietnamese).
    #[arg(long, value_name = "LANGUAGE", hide = true)]
    pub subtitle_to: Option<String>,

    /// SpeakEase meeting notes: write notes for this transcript (a text
    /// file, one speaker turn per line) headlessly with the app's AI order,
    /// print them and exit. Honors --json.
    #[arg(long, value_name = "TRANSCRIPT", hide = true)]
    pub meeting_notes: Option<PathBuf>,

    /// Template for --meeting-notes: meeting, call, lecture or interview
    /// (default: AI guesses).
    #[arg(long, value_name = "KIND", hide = true)]
    pub notes_kind: Option<String>,

    /// Engine for --meeting-notes instead of the app's order: "apple", "key"
    /// or "local=<model.gguf>".
    #[arg(long, value_name = "ENGINE", hide = true)]
    pub notes_engine: Option<String>,
}
