import { languageName } from "./utils/languageName";

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

/** A target's name in the interface language, e.g. "Japanese" → "Tiếng
 * Nhật" in a picker, "tiếng Nhật" inside a sentence. */
export const translateTargetName = (
  value: string,
  uiLanguage: string,
  inSentence = false,
) => {
  const code = TRANSLATE_TARGETS.find((item) => item.value === value)?.code;
  return (
    (code && languageName(code.toLowerCase(), uiLanguage, inSentence)) ?? value
  );
};

/** The prompt the translate steps own; it is not offered as a tidy-up. */
export const TRANSLATE_PROMPT_ID = "speakease_translate_en";
