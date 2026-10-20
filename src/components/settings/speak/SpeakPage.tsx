import React, { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  commands,
  events,
  type HistoryEntry,
  type ModelInfo,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { Keycaps } from "../../ui/Keycaps";
import { useSettings } from "../../../hooks/useSettings";
import { useModelStore } from "../../../stores/modelStore";
import { openSection } from "@/lib/navigation";
import {
  TRANSLATE_PROMPT_ID,
  TRANSLATE_TARGETS as TARGETS,
  translateTargetName,
} from "@/lib/translateTargets";
import type { SidebarSection } from "../../Sidebar";
import { copyToClipboard } from "../history/clipboard";
import {
  CheckIcon,
  CopyIcon,
  CpuIcon,
  MagicStarIcon,
  MicrophoneIcon,
  SearchIcon,
  TranslateIcon,
} from "../../icons/bulk";

// SpeakEase's Speak page: the few things a person changes between one
// dictation and the next, each one tap away. The main shortcut follows
// what is set here (actions.rs quick_steps): the microphone, the model and
// the language it listens for, an AI prompt that tidies the text, and a
// language to translate it into. Each menu ends in a link to the settings
// page that holds the rest of that subject.

/** The languages a model can be told to listen for, most useful first. */
const LISTEN_FOR = ["auto", "vi", "en"] as const;

type MenuId = "mic" | "model" | "ai" | "translate";

/** Where a dictation is (tray.rs set_tray_state emits it). */
type Phase = "idle" | "recording" | "transcribing";

/** Where each menu's "More settings" link goes. */
const MORE_SETTINGS: Record<MenuId, SidebarSection> = {
  mic: "recording",
  model: "recognition",
  ai: "postprocessing",
  translate: "postprocessing",
};

const MenuSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="py-1">
    <h3 className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
      {title}
    </h3>
    <ul className="flex flex-col gap-0.5">{children}</ul>
  </div>
);

const MenuRow: React.FC<{
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  leading?: React.ReactNode;
}> = ({ selected, disabled, onPick, label, hint, leading }) => (
  <li>
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onPick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-start transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "bg-row" : "hover:bg-row/60"
      }`}
    >
      {leading}
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm truncate ${selected ? "font-medium text-logo-primary" : ""}`}
        >
          {label}
        </span>
        {hint && (
          <span className="block text-xs text-mid-gray truncate">{hint}</span>
        )}
      </span>
      {selected && (
        <CheckIcon width={18} height={18} className="text-logo-primary" />
      )}
    </button>
  </li>
);

export const SpeakPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const { settings, audioDevices, updateSetting, refreshAudioDevices } =
    useSettings();
  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.currentModel);
  const selectModel = useModelStore((state) => state.selectModel);
  const [open, setOpen] = useState<MenuId | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  // The microphone button: a dictation started here is shown here, since
  // this window has no text field for it to be pasted into.
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<HistoryEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const awaitingResult = useRef(false);

  useEffect(() => {
    commands
      .isRecording()
      .then((recording) => recording && setPhase("recording"))
      .catch(() => {});
    const unlistenPhase = listen<Phase>("dictation-state", (event) =>
      setPhase(event.payload),
    );
    const unlistenHistory = events.historyUpdatePayload.listen((event) => {
      const update = event.payload;
      if (update.action === "added" && awaitingResult.current) {
        awaitingResult.current = false;
        setResult(update.entry);
        setCopied(false);
      } else if (update.action === "updated") {
        setResult((shown) =>
          shown?.id === update.entry.id ? update.entry : shown,
        );
      }
    });
    return () => {
      unlistenPhase.then((fn) => fn());
      unlistenHistory.then((fn) => fn());
    };
  }, []);

  const toggleDictation = () => {
    if (phase === "transcribing") return;
    if (phase === "idle") awaitingResult.current = true;
    commands.toggleDictation().catch((error) => {
      console.error("Failed to toggle dictation:", error);
      awaitingResult.current = false;
    });
  };

  const resultText = result
    ? result.post_processed_text?.trim()
      ? result.post_processed_text
      : result.transcription_text
    : "";
  const barRef = useRef<HTMLDivElement>(null);
  // Where the open menu stands: fixed to the window, above the bar, so the
  // page's scroll box cannot clip it, and no taller than the room up to the
  // toolbar. Measured from the bar BEFORE the menu opens (and on resize): a
  // menu that rendered first and was placed after sat in the bar for a
  // frame, pushed it up, and was then placed against that wrong bar - high
  // and squashed, on the first open of each menu.
  const [menuBox, setMenuBox] = useState<React.CSSProperties | null>(null);
  const measureMenuBox = (): React.CSSProperties | null => {
    const bar = barRef.current?.getBoundingClientRect();
    if (!bar) return null;
    return {
      position: "fixed",
      left: bar.left + bar.width / 2,
      bottom: window.innerHeight - bar.top + 10,
      transform: "translateX(-50%)",
      // Room from the bar (less the 10px gap) up to 16px under the
      // 60px toolbar.
      maxHeight: Math.max(160, bar.top - 10 - 76),
    };
  };

  useEffect(() => {
    if (!open) return;
    const place = () => setMenuBox(measureMenuBox());
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Close on a click outside the bar and its menus, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open === "mic") refreshAudioDevices();
  }, [open, refreshAudioDevices]);

  const toggle = (menu: MenuId) => {
    if (open !== menu) setMenuBox(measureMenuBox());
    setOpen((now) => (now === menu ? null : menu));
  };

  const selectedMic = settings?.selected_microphone || "Default";
  const model = models.find((m: ModelInfo) => m.id === currentModel);
  const installed = models.filter((m: ModelInfo) => m.is_downloaded);
  const language = settings?.selected_language ?? "auto";
  const prompts = (settings?.post_process_prompts ?? []).filter(
    (prompt) => prompt.id !== TRANSLATE_PROMPT_ID,
  );
  const enhanceId = settings?.speakease_enhance_prompt_id ?? null;
  const enhance = prompts.find((prompt) => prompt.id === enhanceId);
  const targetValue = settings?.speakease_translate_target ?? null;
  const target = TARGETS.find((item) => item.value === targetValue);
  const binding = settings?.bindings?.transcribe?.current_binding ?? "";

  const languageName = (code: string) =>
    code === "auto"
      ? t("speak.language.auto")
      : (new Intl.DisplayNames([i18n.language], { type: "language" }).of(
          code,
        ) ?? code);
  const targetName = (value: string) =>
    translateTargetName(value, i18n.language);

  // With AI switched off nothing tidies or translates (actions.rs
  // quick_steps); the two AI chips say so instead of showing a choice.
  const aiEnabled = settings?.post_process_enabled ?? false;
  const supportsLanguage = model?.supports_language_selection ?? true;
  const pipeline = [
    languageName(language),
    aiEnabled && enhance ? enhance.name : null,
    aiEnabled && target
      ? t("speak.pipeline.translate", {
          language: translateTargetName(target.value, i18n.language, true),
        })
      : null,
  ].filter(Boolean);

  const chip = (
    menu: MenuId,
    icon: React.ReactNode,
    label: string,
    active = false,
  ) => (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open === menu}
      onClick={() => toggle(menu)}
      className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-sm transition-colors cursor-pointer min-w-0 max-w-40 shrink focus-visible:outline-2 focus-visible:outline-logo-primary ${
        open === menu
          ? "bg-row text-text"
          : active
            ? "bg-logo-primary/15 text-logo-primary hover:bg-logo-primary/20"
            : "text-text/80 hover:bg-row/70"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  const shownTargets = TARGETS.filter((item) =>
    `${item.value} ${targetName(item.value)} ${item.code}`
      .toLowerCase()
      .includes(targetQuery.trim().toLowerCase()),
  );

  return (
    // The orb fills the page and the bar sits at its foot, as in a
    // dictation app: the menus open upward into the room the orb leaves.
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center min-h-[calc(100vh-150px)]">
      {/* The orb: what to press, and what will happen to what you say. A
          click starts a dictation and the next one stops it, like the
          shortcut pressed twice. */}
      <div className="w-full flex-1 flex flex-col items-center justify-center gap-5 text-center">
        <button
          type="button"
          onClick={toggleDictation}
          disabled={phase === "transcribing"}
          aria-label={
            phase === "recording" ? t("speak.orb.stop") : t("speak.orb.start")
          }
          className="group relative grid place-items-center size-32 rounded-full bg-logo-primary/10 cursor-pointer disabled:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-logo-primary shadow-[0_0_0_10px_color-mix(in_srgb,var(--color-logo-primary)_6%,transparent),0_0_60px_color-mix(in_srgb,var(--color-logo-primary)_25%,transparent)]"
        >
          {phase === "recording" && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-logo-primary/25 animate-ping motion-reduce:animate-none"
            />
          )}
          <span
            className={`relative grid place-items-center size-20 rounded-full text-white transition-transform group-hover:scale-105 group-active:scale-95 ${
              phase === "recording" ? "bg-error" : "bg-background-ui"
            }`}
          >
            {phase === "recording" ? (
              <span aria-hidden className="size-7 rounded-md bg-white" />
            ) : phase === "transcribing" ? (
              <span
                aria-hidden
                className="size-9 rounded-full border-[3px] border-white/40 border-t-white animate-spin"
              />
            ) : (
              <MicrophoneIcon width={36} height={36} />
            )}
          </span>
        </button>
        <div className="space-y-1.5">
          <p className="font-display text-xl font-semibold">
            {phase === "recording"
              ? t("speak.orb.stop")
              : phase === "transcribing"
                ? t("speak.orb.working")
                : binding && (
                    // The shortcut drawn as keys, as on the Recording page.
                    <Trans
                      i18nKey="speak.hold"
                      components={{
                        keys: <Keycaps combination={binding} osType={osType} />,
                      }}
                    />
                  )}
          </p>
          <p className="text-sm text-mid-gray">
            {phase === "idle"
              ? `${t("speak.orb.orClick")} · ${pipeline.join(" → ")}`
              : pipeline.join(" → ")}
          </p>
        </div>

        {result && phase === "idle" && (
          <div className="w-full max-w-md text-start rounded-2xl border border-hairline bg-surface px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
                {t("speak.result.title")}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (await copyToClipboard(resultText)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-logo-primary hover:bg-logo-primary/10 cursor-pointer"
              >
                {copied ? (
                  <CheckIcon width={14} height={14} />
                ) : (
                  <CopyIcon width={14} height={14} />
                )}
                {copied ? t("speak.result.copied") : t("speak.result.copy")}
              </button>
            </div>
            <p className="text-[15px] leading-relaxed select-text cursor-text whitespace-pre-wrap break-words">
              {resultText || t("settings.history.transcriptionFailed")}
            </p>
          </div>
        )}
      </div>

      {/* The bar of quick settings, each opening its menu above it. */}
      <div
        ref={barRef}
        className="relative flex flex-nowrap justify-center items-center gap-1 p-1.5 mb-1 max-w-full rounded-full border border-hairline bg-surface shadow-sm"
      >
        {chip(
          "mic",
          <MicrophoneIcon width={18} height={18} />,
          selectedMic === "Default" ? t("speak.mic.chip") : selectedMic,
        )}
        {chip(
          "model",
          <CpuIcon width={18} height={18} />,
          `${model?.name ?? t("speak.model.none")} · ${
            language === "auto"
              ? t("speak.language.autoShort")
              : language.toUpperCase()
          }`,
        )}
        {chip(
          "ai",
          <MagicStarIcon width={18} height={18} />,
          !aiEnabled
            ? t("speak.ai.disabled")
            : enhance
              ? enhance.name
              : t("speak.ai.off"),
          aiEnabled && Boolean(enhance),
        )}
        {chip(
          "translate",
          <TranslateIcon width={18} height={18} />,
          aiEnabled && target ? `→ ${target.code}` : t("speak.translate.off"),
          aiEnabled && Boolean(target),
        )}

        {open && menuBox && (
          <div
            role="menu"
            style={menuBox}
            className="z-50 w-80 overflow-y-auto p-1.5 rounded-2xl border border-hairline bg-surface shadow-2xl"
          >
            {open === "mic" && (
              <MenuSection title={t("speak.mic.title")}>
                {audioDevices.map((device) => (
                  <MenuRow
                    key={device.index}
                    selected={device.name === selectedMic}
                    onPick={() => {
                      updateSetting("selected_microphone", device.name);
                      setOpen(null);
                    }}
                    leading={
                      <MicrophoneIcon
                        width={18}
                        height={18}
                        className="text-mid-gray shrink-0"
                      />
                    }
                    label={
                      device.name === "Default"
                        ? t("speak.mic.default")
                        : device.name
                    }
                    hint={
                      device.name === "Default"
                        ? t("speak.mic.defaultHint")
                        : undefined
                    }
                  />
                ))}
              </MenuSection>
            )}

            {open === "model" && (
              <>
                <MenuSection title={t("speak.model.title")}>
                  {installed.map((item: ModelInfo) => (
                    <MenuRow
                      key={item.id}
                      selected={item.id === currentModel}
                      onPick={() => selectModel(item.id)}
                      label={item.name}
                      hint={t("speak.model.hint", {
                        count: item.supported_languages.length,
                      })}
                    />
                  ))}
                </MenuSection>
                <MenuSection title={t("speak.language.title")}>
                  {LISTEN_FOR.map((code) => (
                    <MenuRow
                      key={code}
                      selected={language === code}
                      disabled={
                        code !== "auto" &&
                        (!supportsLanguage ||
                          !(model?.supported_languages ?? []).includes(code))
                      }
                      onPick={() => updateSetting("selected_language", code)}
                      label={languageName(code)}
                      hint={
                        code === "vi"
                          ? t("speak.language.viHint")
                          : code === "auto" &&
                              model &&
                              !model.supports_language_detection
                            ? // The model cannot tell; SpeakEase tries both
                              // (transcription.rs languages_to_try).
                              t("speak.language.autoTriesBoth")
                            : undefined
                      }
                    />
                  ))}
                </MenuSection>
              </>
            )}

            {(open === "ai" || open === "translate") && !aiEnabled && (
              <div className="px-3 py-2 space-y-2">
                <p className="text-sm text-mid-gray">
                  {t("speak.ai.disabledHint")}
                </p>
                <button
                  type="button"
                  onClick={() => updateSetting("post_process_enabled", true)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-background-ui text-white hover:bg-brand-deep cursor-pointer"
                >
                  {t("speak.ai.enable")}
                </button>
              </div>
            )}

            {open === "ai" && aiEnabled && (
              <MenuSection title={t("speak.ai.title")}>
                <MenuRow
                  selected={!enhance}
                  onPick={() => {
                    updateSetting("speakease_enhance_prompt_id", null);
                    setOpen(null);
                  }}
                  label={t("speak.ai.off")}
                  hint={t("speak.ai.offHint")}
                />
                {prompts.map((prompt) => (
                  <MenuRow
                    key={prompt.id}
                    selected={prompt.id === enhanceId}
                    onPick={() => {
                      updateSetting("speakease_enhance_prompt_id", prompt.id);
                      setOpen(null);
                    }}
                    leading={
                      <MagicStarIcon
                        width={18}
                        height={18}
                        className="text-mid-gray shrink-0"
                      />
                    }
                    label={prompt.name}
                  />
                ))}
              </MenuSection>
            )}

            {open === "translate" && aiEnabled && (
              <MenuSection title={t("speak.translate.title")}>
                <li className="px-1.5 pb-1">
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-row">
                    <SearchIcon
                      width={16}
                      height={16}
                      className="text-mid-gray"
                    />
                    <input
                      type="search"
                      value={targetQuery}
                      onChange={(event) => setTargetQuery(event.target.value)}
                      placeholder={t("speak.translate.search")}
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>
                </li>
                <MenuRow
                  selected={!target}
                  onPick={() => {
                    updateSetting("speakease_translate_target", null);
                    setOpen(null);
                  }}
                  label={t("speak.translate.off")}
                  hint={t("speak.translate.offHint")}
                />
                {shownTargets.map((item) => (
                  <MenuRow
                    key={item.value}
                    selected={item.value === targetValue}
                    onPick={() => {
                      updateSetting("speakease_translate_target", item.value);
                      setOpen(null);
                    }}
                    leading={<span aria-hidden>{item.flag}</span>}
                    label={`${targetName(item.value)} — ${item.code}`}
                  />
                ))}
              </MenuSection>
            )}

            <div className="mt-1 pt-1 border-t border-hairline">
              <button
                type="button"
                onClick={() => {
                  const section = MORE_SETTINGS[open];
                  setOpen(null);
                  openSection(section);
                }}
                className="w-full px-3 py-2 rounded-xl text-start text-sm text-logo-primary hover:bg-row/60 cursor-pointer"
              >
                {t("speak.moreSettings")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
