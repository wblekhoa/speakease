import i18next from "i18next";
import { languageName } from "./languageName";
import type { TFunction } from "i18next";
import type { ModelInfo } from "@/bindings";
import { vietnameseResult } from "./vietnameseModels";

/**
 * Get the translated name for a model
 * @param model - The model info object
 * @param t - The translation function from useTranslation
 * @returns The translated model name, or the original name if no translation exists
 */
export function getTranslatedModelName(model: ModelInfo, t: TFunction): string {
  const translationKey = `onboarding.models.${model.id}.name`;
  const translated = t(translationKey, { defaultValue: "" });
  return translated !== "" ? translated : model.name;
}

/**
 * Get the translated description for a model
 * @param model - The model info object
 * @param t - The translation function from useTranslation
 * @returns The translated model description, or the original description if no translation exists
 */
export function getTranslatedModelDescription(
  model: ModelInfo,
  t: TFunction,
): string {
  // Custom models use a generic translation key
  if (model.is_custom) {
    return t("onboarding.customModelDescription");
  }
  // SpeakEase: Vietnamese descriptions for the models measured on Vietnamese.
  const measured = vietnameseResult(model);
  if (measured) {
    const vietnamese = t(`vietnameseModels.${measured.key}`, {
      defaultValue: "",
    });
    if (vietnamese !== "") return vietnamese;
  }
  const translationKey = `onboarding.models.${model.id}.description`;
  const translated = t(translationKey, { defaultValue: "" });
  if (translated !== "") return translated;
  return (
    (i18next.language?.startsWith("vi") &&
      describeTemplated(model.description, t)) ||
    model.description
  );
}

/**
 * SpeakEase: most catalog descriptions follow one English template -
 * "N-language speech-to-text with translation, auto language detection,
 * segment-level timestamps." - which is rebuilt here in the reader's
 * language. Timestamps are left out: nothing in SpeakEase shows them.
 * Anything else returns null and keeps the catalog's own words.
 */
const TEMPLATED =
  /^(English|Vietnamese|(\d+)-language) speech-to-text(?: with (.+?))?\.?$/;
const FEATURES: Record<string, string> = {
  translation: "modelDescription.translation",
  "auto language detection": "modelDescription.detection",
  streaming: "modelDescription.streaming",
};

const describeTemplated = (description: string, t: TFunction) => {
  const match = TEMPLATED.exec(description.trim());
  if (!match) return null;
  const [, subject, count, features = ""] = match;
  const what = count
    ? t("modelDescription.languages", { count: Number(count) })
    : (languageName(
        subject === "English" ? "en" : "vi",
        i18next.language,
        true,
      ) ?? subject);
  const parts = features
    .split(",")
    .map((feature) => FEATURES[feature.trim()])
    .filter(Boolean)
    .map((key) => t(key));
  return (
    [t("modelDescription.transcribes", { what }), ...parts].join(", ") + "."
  );
};
