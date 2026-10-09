import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useSettings } from "../../../hooks/useSettings";
import { useModelStore } from "../../../stores/modelStore";
import {
  CheckIcon,
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
// language to translate it into.

/** Translation targets. `value` is what the prompt says, so it stays in
 * English; the label is the reader's. */
const TARGETS = [
  { value: "English", code: "EN", flag: "🇬🇧" },
  { value: "Vietnamese", code: "VI", flag: "🇻🇳" },
  { value: "Japanese", code: "JA", flag: "🇯🇵" },
  { value: "Korean", code: "KO", flag: "🇰🇷" },
  { value: "Chinese (Simplified)", code: "ZH", flag: "🇨🇳" },
  { value: "French", code: "FR", flag: "🇫🇷" },
  { value: "German", code: "DE", flag: "🇩🇪" },
  { value: "Spanish", code: "ES", flag: "🇪🇸" },
  { value: "Thai", code: "TH", flag: "🇹🇭" },
  { value: "Indonesian", code: "ID", flag: "🇮🇩" },
  { value: "Russian", code: "RU", flag: "🇷🇺" },
  { value: "Portuguese", code: "PT", flag: "🇵🇹" },
] as const;

/** The languages a model can be told to listen for, most useful first. */
const LISTEN_FOR = ["auto", "vi", "en"] as const;

/** The prompt the translate shortcut owns; it is offered as a target here. */
const TRANSLATE_PROMPT_ID = "speakease_translate_en";

type MenuId = "mic" | "model" | "ai" | "translate";

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
  const keys = binding ? formatKeyCombination(binding, osType) : "";

  const languageName = (code: string) =>
    code === "auto"
      ? t("speak.language.auto")
      : (new Intl.DisplayNames([i18n.language], { type: "language" }).of(
          code,
        ) ?? code);
  const targetName = (value: string) => {
    const code = TARGETS.find((item) => item.value === value)?.code;
    return code
      ? (new Intl.DisplayNames([i18n.language], { type: "language" }).of(
          code.toLowerCase(),
        ) ?? value)
      : value;
  };

  const supportsLanguage = model?.supports_language_selection ?? true;
  const pipeline = [
    languageName(language),
    enhance ? enhance.name : null,
    target
      ? t("speak.pipeline.translate", { language: targetName(target.value) })
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
      {/* The orb: what to press, and what will happen to what you say. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
        <div className="relative grid place-items-center size-32 rounded-full bg-logo-primary/10 shadow-[0_0_0_10px_color-mix(in_srgb,var(--color-logo-primary)_6%,transparent),0_0_60px_color-mix(in_srgb,var(--color-logo-primary)_25%,transparent)]">
          <div className="grid place-items-center size-20 rounded-full bg-logo-primary text-white">
            <MicrophoneIcon width={36} height={36} />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="font-display text-xl font-semibold">
            {t("speak.hold", { keys })}
          </p>
          <p className="text-sm text-mid-gray">{pipeline.join(" → ")}</p>
        </div>
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
          enhance ? enhance.name : t("speak.ai.off"),
          Boolean(enhance),
        )}
        {chip(
          "translate",
          <TranslateIcon width={18} height={18} />,
          target ? `→ ${target.code}` : t("speak.translate.off"),
          Boolean(target),
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
                        code === "vi" ? t("speak.language.viHint") : undefined
                      }
                    />
                  ))}
                </MenuSection>
              </>
            )}

            {open === "ai" && (
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

            {open === "translate" && (
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
          </div>
        )}
      </div>
    </div>
  );
};
