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

const settings: Json = structuredClone(settingsFixture) as Json;
let dictating = false;
const models = structuredClone(modelsFixture) as Json[];

// `?onboarding` previews first run: nothing downloaded, onboarding not done.
if (new URLSearchParams(location.search).has("onboarding")) {
  settings.onboarding_completed = false;
  settings.selected_model = "";
  for (const model of models) model.is_downloaded = false;
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
