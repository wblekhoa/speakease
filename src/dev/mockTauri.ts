/**
 * Browser preview of the settings window (SpeakEase dev tool).
 *
 * `bun run dev` in a plain browser has no Tauri backend, so every command
 * would fail and the window would render empty. When there is no backend,
 * this module stands one in: the real model list and settings shape
 * (fixtures captured from the app, API keys blank), example history in
 * Vietnamese, and change_* commands that write to an in-memory copy.
 *
 * It does nothing inside the real app (`__TAURI_INTERNALS__` exists there)
 * and is only imported in dev builds.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import modelsFixture from "./models.fixture.json";
import settingsFixture from "./settings.fixture.json";

type Json = Record<string, unknown>;

const hasBackend = "__TAURI_INTERNALS__" in window;

const MINUTE = 60_000;
const now = Date.now();
const history = [
  {
    text: "ờ thì là cuộc họp ngày mai lúc hai giờ chiều với anh nam bên công ty abc nhé nhớ mang theo báo cáo quý ba",
    ai: "Cuộc họp ngày mai lúc 2 giờ chiều với anh Nam bên công ty ABC nhé, nhớ mang theo báo cáo quý ba.",
    ago: 4,
    saved: true,
    prompt: "speakease_vi_cleanup",
  },
  {
    text: "em gửi anh cái link figma rồi đó anh check giúp em phần onboarding với nha",
    ai: "I sent you the Figma link. Could you check the onboarding part for me?",
    ago: 26,
    saved: false,
    prompt: "speakease_translate_en",
  },
  {
    text: "doanh thu tháng này tăng mười lăm phần trăm so với tháng trước tức là khoảng ba trăm hai mươi triệu đồng",
    ai: null,
    ago: 95,
    saved: false,
  },
  {
    text: "nhắc mình mua sữa với trứng trên đường về",
    ai: null,
    ago: 60 * 26,
    saved: false,
  },
].map((entry, index) => ({
  id: 100 - index,
  file_name: `speakease-${index}.wav`,
  timestamp: Math.floor((now - entry.ago * MINUTE) / 1000),
  saved: entry.saved,
  title: "",
  transcription_text: entry.text,
  post_processed_text: entry.ai,
  // The app stores the prompt's text, not its id.
  post_process_prompt:
    (
      settingsFixture.post_process_prompts as { id: string; prompt: string }[]
    ).find((p) => p.id === (entry as { prompt?: string }).prompt)?.prompt ??
    null,
  post_process_requested: entry.ai !== null,
}));

// A transcript made from a file (Files page), as transcribe_media saves it.
const FILE_TEXT =
  "Xin chào các bạn, hôm nay mình sẽ chia sẻ cách mình lên kế hoạch cho một video trên kênh YouTube. Đầu tiên mình viết ra ý tưởng chính trong một câu ngắn. Sau đó mình chia nội dung thành ba phần: mở đầu, phần chính và phần kết. Ở phần mở đầu, mình cố gắng nói rõ người xem sẽ nhận được gì sau khi xem hết video. Phần chính là nơi mình đưa ra ví dụ cụ thể, số liệu và những sai lầm mình từng gặp. Cuối cùng, mình tóm tắt lại ba điều quan trọng nhất và mời mọi người để lại bình luận. Một mẹo nhỏ là mình luôn quay thử một đoạn ngắn trước để kiểm tra âm thanh và ánh sáng. Nếu âm thanh bị rè, cả video sẽ mất đi nhiều giá trị. Mình thường dùng một chiếc micro cài áo và ngồi trong phòng có nhiều rèm để giảm tiếng vang.";
history.unshift({
  id: 101,
  file_name: "file-1760000000000.wav",
  timestamp: Math.floor((now - 40 * MINUTE) / 1000),
  saved: false,
  title: "vlog-len-ke-hoach-video.mp4",
  transcription_text: FILE_TEXT,
  post_processed_text: null,
  post_process_prompt: null,
  post_process_requested: false,
});

// `?slow` stretches the file jobs tenfold, to watch the progress bar
// through a long step.
const SLOW = new URLSearchParams(location.search).has("slow") ? 10 : 1;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms * SLOW));
let fileCancelled = false;

/** transcribe_media as the app does it: progress events, then a new entry. */
async function mockTranscribeMedia(source: { kind: string; value: string }) {
  fileCancelled = false;
  const name =
    source.kind === "url"
      ? "youtube-video"
      : (source.value.split("/").pop() ?? "file");
  const steps: [string, number][] = [
    ...(source.kind === "url" ? ([["download", 1]] as [string, number][]) : []),
    ["read", 1000],
    ["transcribe", 6],
  ];
  for (const [phase, total] of steps) {
    for (let done = 0; done <= total; done += total === 1000 ? 250 : 1) {
      if (fileCancelled) throw "cancelled";
      await emit("file-progress", { phase, done, total });
      await wait(250);
    }
  }
  const entry = {
    id: Date.now() % 1_000_000,
    file_name: `file-${Date.now()}.wav`,
    timestamp: Math.floor(Date.now() / 1000),
    saved: false,
    title: name,
    transcription_text: FILE_TEXT,
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  };
  history.unshift(entry);
  await emit("history-update-payload", { action: "added", entry });
  return entry;
}

async function mockEnhance(
  id: number,
  enhancement: { kind: string; value: string },
) {
  const entry = history.find((e) => e.id === id);
  if (!entry) throw "not found";
  if (!settings.post_process_enabled) throw "ai off";
  for (let done = 0; done <= 3; done++) {
    await emit("file-progress", { phase: "enhance", done, total: 3 });
    await wait(300);
  }
  entry.post_processed_text =
    enhancement.kind === "translate"
      ? "Hi everyone, today I'll share how I plan a video for my YouTube channel. First I write the main idea in one short sentence. Then I split the content into three parts: the opening, the main part and the ending."
      : "Xin chào các bạn! Hôm nay mình chia sẻ cách lên kế hoạch cho một video YouTube.\n\nĐầu tiên, viết ý tưởng chính trong một câu ngắn. Sau đó chia nội dung thành ba phần: mở đầu, phần chính và phần kết.";
  entry.post_process_prompt = enhancement.value;
  await emit("history-update-payload", { action: "updated", entry });
  return entry;
}

const settings: Json = structuredClone(settingsFixture) as Json;
let dictating = false;
const models = structuredClone(modelsFixture) as Json[];

// On-device AI models (local_ai.rs): one downloaded and in use, the rest to
// download, so the AI page shows every state.
const aiModels: Json[] = [
  ["qwen3.5-2b", "Qwen3.5 2B", 1221, 1700, 95, 70, "light", false],
  ["gemma-4-e2b", "Gemma 4 E2B", 3194, 3500, 88, 82, "balanced", false],
  ["qwen3.5-4b", "Qwen3.5 4B", 2614, 3500, 75, 84, "best", false],
  ["gemma-4-e4b", "Gemma 4 E4B", 4746, 5100, 72, 85, null, true],
  ["qwen3.5-9b", "Qwen3.5 9B", 5417, 6300, 55, 88, null, true],
].map(([id, name, size_mb, ram_mb, speed, accuracy, pick, heavy]) => ({
  id,
  name,
  family: "",
  parameters: "",
  size_mb,
  ram_mb,
  license: "Apache-2.0",
  speed_score: speed,
  accuracy_score: accuracy,
  pick,
  heavy,
  is_downloaded: id === "gemma-4-e2b",
  is_downloading: false,
  partial_mb: 0,
  is_active: id === "gemma-4-e2b",
}));
const providers = settings.post_process_providers as Json[];
if (!providers.some((provider) => provider.id === "local_ai")) {
  providers.push({
    id: "local_ai",
    label: "On-device model",
    base_url: "http://127.0.0.1/v1",
    allow_base_url_edit: false,
    models_endpoint: null,
    supports_structured_output: false,
  });
}

// `?onboarding` previews first run: nothing downloaded, onboarding not done.
if (new URLSearchParams(location.search).has("onboarding")) {
  settings.onboarding_completed = false;
  settings.selected_model = "";
  for (const model of models) model.is_downloaded = false;
}

// `?subtitles` previews live subtitles (behind Experimental).
if (new URLSearchParams(location.search).has("subtitles")) {
  settings.experimental_enabled = true;
}
let subtitlesRunning: string | null = null;
let subtitlesTranslate = true;
const SUBTITLE_APPS = [
  { bundle_id: "com.google.Chrome", name: "Google Chrome", playing: true },
  {
    bundle_id: "com.apple.QuickTimePlayerX",
    name: "QuickTime Player",
    playing: false,
  },
  { bundle_id: "us.zoom.xos", name: "zoom.us", playing: false },
];

// The subtitle bar's own page plays a short scripted session.
if (location.pathname.includes("/src/subtitles/")) {
  const script: [number, Json][] = [
    [300, { kind: "context", app_name: "Google Chrome", playing: null }],
    [600, { kind: "tapping", model: "demo" }],
    [
      1200,
      {
        kind: "line",
        index: 1,
        source: "That's exactly what happened to Krafton.",
      },
    ],
    [
      2200,
      {
        kind: "translation",
        index: 1,
        target: "Đó chính là điều đã xảy ra với Krafton.",
      },
    ],
    [
      2600,
      {
        kind: "line",
        index: 2,
        source:
          "During a PUBG tournament that had a seventy-thousand-dollar prize pool,",
      },
    ],
    [
      3600,
      {
        kind: "translation",
        index: 2,
        target: "Trong một giải đấu PUBG có tổng giải thưởng 70.000 đô la,",
      },
    ],
    [4000, { kind: "partial", index: 3, source: "Team Korea accused" }],
    [
      4800,
      {
        kind: "line",
        index: 3,
        source: "Team Korea accused Team Vietnam of cheating.",
      },
    ],
    [
      5800,
      {
        kind: "translation",
        index: 3,
        target: "Đội Hàn Quốc cáo buộc Đội Việt Nam gian lận.",
      },
    ],
    [
      6400,
      {
        kind: "rejoin",
        indexes: [2, 3],
        source:
          "During a PUBG tournament that had a seventy-thousand-dollar prize pool, Team Korea accused Team Vietnam of cheating.",
        target:
          "Trong một giải đấu PUBG có tổng giải thưởng 70.000 đô la, Đội Hàn Quốc đã cáo buộc Đội Việt Nam gian lận.",
      },
    ],
    [
      7000,
      {
        kind: "partial",
        index: 4,
        source: "And this became a massive controversy",
      },
    ],
  ];

  for (const [at, payload] of script) {
    setTimeout(() => emit("live-subtitle", payload), at);
  }
}

/** `change_foo_bar_setting` → `foo_bar`, with the few names that differ. */
const SETTING_ALIASES: Record<string, string> = {
  audio_feedback_volume: "audio_feedback_volume",
  update_checks: "update_checks_enabled",
  autostart: "autostart_enabled",
  post_process_enabled: "post_process_enabled",
  experimental_enabled: "experimental_enabled",
  vad_enabled: "vad_enabled",
};

function applyChange(cmd: string, args: Json) {
  const match = /^change_(.+)_setting$/.exec(cmd);
  if (!match) return false;
  const key = SETTING_ALIASES[match[1]] ?? match[1];
  const value = Object.values(args ?? {})[0];
  settings[key] = value;
  return true;
}

function words(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function handle(cmd: string, args: Json): unknown {
  if (applyChange(cmd, args)) return null;
  switch (cmd) {
    case "get_app_settings":
      return settings;
    case "get_default_settings":
      return settingsFixture;
    case "get_available_models":
      return models;
    case "get_current_model":
      return settings.selected_model;
    case "get_model_info":
      return models.find((m) => m.id === args.modelId) ?? null;
    case "get_transcription_model_status":
    case "is_model_loading":
      return cmd === "is_model_loading" ? false : settings.selected_model;
    case "get_model_load_status":
      return { is_loaded: true, current_model: settings.selected_model };
    case "transcribe_media":
      return mockTranscribeMedia(
        args.source as { kind: string; value: string },
      );
    case "enhance_history_entry":
      return mockEnhance(
        args.id as number,
        args.enhancement as { kind: string; value: string },
      );
    case "cancel_file_job":
      fileCancelled = true;
      return null;
    case "write_text_file":
      return null;
    // `?meeting=recording|transcribing|notes|error` previews the meeting bar
    // (src/meeting/index.html).
    case "meeting_state": {
      const phase =
        new URLSearchParams(location.search).get("meeting") ?? "recording";
      return phase === "error"
        ? {
            phase: "idle",
            started_at: null,
            app_name: null,
            error: "no-app: no meeting app is running",
            history_id: null,
          }
        : {
            phase,
            started_at: Math.floor(Date.now() / 1000) - 754,
            app_name: "zoom.us",
            error: null,
            history_id: null,
          };
    }
    case "stop_meeting":
    case "close_meeting_bar":
      return null;
    case "live_subtitles_supported":
      return true;
    case "live_subtitle_apps":
      return SUBTITLE_APPS;
    case "live_subtitles_state":
      return {
        running: subtitlesRunning !== null,
        bundle_id: subtitlesRunning,
        error: null,
        translate: subtitlesTranslate,
      };
    case "start_live_subtitles":
      subtitlesRunning = args.bundleId as string;
      settings.live_subtitle_app = args.bundleId;
      settings.live_subtitle_source = args.source;
      settings.live_subtitle_target = args.target;
      emit("live-subtitles-state", {
        running: true,
        bundle_id: subtitlesRunning,
        error: null,
        translate: subtitlesTranslate,
      });
      return null;
    case "set_live_subtitles_translate":
      subtitlesTranslate = args.on as boolean;
      emit("live-subtitles-state", {
        running: subtitlesRunning !== null,
        bundle_id: subtitlesRunning,
        error: null,
        translate: subtitlesTranslate,
      });
      return null;
    case "live_subtitles_play_pause":
      return true;
    case "show_live_subtitles_panel":
      return null;
    case "ai_models_supported":
      return true;
    case "list_ai_models":
      return structuredClone(aiModels);
    case "mac_memory_gb":
      return 16;
    case "has_local_ai_model":
      return aiModels.some((model) => model.is_active);
    case "set_active_ai_model":
      aiModels.forEach((model) => {
        model.is_active = model.id === args.id && Boolean(model.is_downloaded);
      });
      emit("ai-models-updated", null);
      return null;
    case "download_ai_model":
    case "delete_ai_model":
    case "cancel_ai_model_download":
      return null;
    case "change_live_subtitle_translator_setting":
      settings.live_subtitle_translator = args.value;
      return null;
    case "stop_live_subtitles":
      subtitlesRunning = null;
      emit("live-subtitles-state", {
        running: false,
        bundle_id: null,
        error: null,
        translate: subtitlesTranslate,
      });
      return null;
    case "ytdlp_available":
      // The preview plays a Mac without yt-dlp, to show the guide.
      return false;
    case "plugin:dialog|open":
      return (args.options as { multiple?: boolean } | undefined)?.multiple
        ? [
            "/Users/you/Movies/phong-van-khach-hang.mov",
            "/Users/you/Music/podcast-tap-12.mp3",
          ]
        : "/Users/you/Movies/phong-van-khach-hang.mov";
    case "plugin:dialog|save":
      return "/Users/you/Documents/phong-van-khach-hang.txt";
    case "get_history_entries":
      return { entries: history, has_more: false };
    case "search_history_entries": {
      const q = String(args.query ?? "").toLowerCase();
      return history.filter((e) =>
        `${e.transcription_text} ${e.post_processed_text ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    case "get_history_stats": {
      const total = history.reduce(
        (n, e) => n + words(e.post_processed_text ?? e.transcription_text),
        0,
      );
      return {
        entries: history.length,
        words: total,
        minutes_saved: Math.round((total / 40 - total / 150) * 10) / 10,
      };
    }
    case "get_available_microphones":
      return [
        { index: "default", name: "Default", is_default: true },
        { index: "1", name: "MacBook Pro Microphone", is_default: false },
        { index: "2", name: "AirPods Pro", is_default: false },
      ];
    case "get_available_output_devices":
      return [
        { index: "default", name: "Default", is_default: true },
        { index: "1", name: "MacBook Pro Speakers", is_default: false },
      ];
    case "set_selected_microphone":
      settings.selected_microphone = args.deviceName;
      return null;
    case "set_active_model":
      settings.selected_model = args.modelId;
      return null;
    case "get_selected_microphone":
    case "get_selected_output_device":
      return "Default";
    case "toggle_dictation":
      // The Speak page's microphone: start, then stop and "transcribe".
      if (!dictating) {
        dictating = true;
        void emit("dictation-state", "recording");
      } else {
        dictating = false;
        void emit("dictation-state", "transcribing");
        setTimeout(() => {
          const entry = {
            ...history[0],
            id: Date.now(),
            timestamp: Math.floor(Date.now() / 1000),
            transcription_text: "thử nói một câu ngắn từ nút micro",
            post_processed_text: "Thử nói một câu ngắn từ nút micro.",
          };
          void emit("history-update-payload", { action: "added", entry });
          void emit("dictation-state", "idle");
        }, 900);
      }
      return null;
    case "check_custom_sounds":
      return { start: false, stop: false };
    case "get_microphone_channels":
      return [];
    case "get_available_typing_tools":
      return ["auto"];
    case "get_available_accelerators":
      return { transcribe: ["auto"], ort: ["auto"], gpu_devices: [] };
    case "get_keyboard_implementation":
      return settings.keyboard_implementation ?? "tauri";
    case "check_apple_intelligence_available":
      return true;
    case "is_portable":
    case "is_update_checks_locked":
    case "is_recording":
    case "is_laptop":
      return cmd === "is_update_checks_locked";
    case "get_secure_input_status":
      return { active: false };
    case "get_app_dir_path":
      return "/Users/you/Library/Application Support/com.wblekhoa.speakease";
    case "get_log_dir_path":
      return "/Users/you/Library/Logs/com.wblekhoa.speakease";
    case "set_post_process_selected_prompt":
      settings.post_process_selected_prompt_id = args.id;
      return null;
    case "set_post_process_provider":
      settings.post_process_provider_id = args.providerId;
      return null;
    case "fetch_post_process_models":
      return [];
    case "plugin:app|version":
      return "0.1.0";
    case "plugin:app|name":
      return "SpeakEase";
    case "plugin:autostart|is_enabled":
      return false;
    case "plugin:macos-permissions|check_accessibility_permission":
    case "plugin:macos-permissions|check_microphone_permission":
      return true;
    default:
      if (!cmd.startsWith("plugin:event|")) {
        console.debug("[mockTauri] unhandled", cmd, args);
      }
      return null;
  }
}

if (!hasBackend) {
  // Marks the page as the preview, so code that asks "is this the Mac
  // app?" by looking for the Tauri internals is not fooled by the mock.
  (window as unknown as Json).__SPEAKEASE_PREVIEW__ = true;
  (window as unknown as Json).__TAURI_OS_PLUGIN_INTERNALS__ = {
    platform: "macos",
    os_type: "macos",
    family: "unix",
    version: "26.0",
    arch: "aarch64",
    eol: "\n",
    exe_extension: "",
  };
  mockWindows("main");
  mockIPC((cmd, args) => handle(cmd, (args ?? {}) as Json), {
    shouldMockEvents: true,
  });
  // A debug hook: `__mockEmit("model-state-changed", {...})` from the console.
  (window as unknown as Json).__mockEmit = emit;
}
