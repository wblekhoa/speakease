/**
 * The languages SpeakEase translates into. `value` is what the prompt says
 * (and what is stored), so it stays in English; the label is the reader's.
 * The tray menu keeps the same list (settings.rs TRANSLATE_TARGETS).
 */
export const TRANSLATE_TARGETS = [
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

/** A target's name in the interface language, e.g. "Japanese" → "tiếng Nhật". */
export const translateTargetName = (value: string, uiLanguage: string) => {
  const code = TRANSLATE_TARGETS.find((item) => item.value === value)?.code;
  if (!code) return value;
  try {
    return (
      new Intl.DisplayNames([uiLanguage], { type: "language" }).of(
        code.toLowerCase(),
      ) ?? value
    );
  } catch {
    return value;
  }
};

/** The prompt the translate steps own; it is not offered as a tidy-up. */
export const TRANSLATE_PROMPT_ID = "speakease_translate_en";
