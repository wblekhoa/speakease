import React from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { useSettings } from "../../../hooks/useSettings";
import { useModelStore } from "../../../stores/modelStore";
import { LanguageSelector } from "../LanguageSelector";
import { CustomWords } from "../CustomWords";
import { FillerWordRemoval } from "../FillerWordRemoval";
import { ChineseScriptSetting } from "../ChineseScript";
import { TranslateToEnglish } from "../TranslateToEnglish";
import { ModelUnloadTimeoutSetting } from "../ModelUnloadTimeout";
import { ModelsSettings } from "../models/ModelsSettings";

// SpeakEase's Recognition page: how speech becomes words - what the model
// listens for, the words it must get right, and the models themselves.
export const RecognitionSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const { currentModel, models } = useModelStore();
  const model = models.find((m: ModelInfo) => m.id === currentModel);
  const language = getSetting("selected_language") ?? "auto";

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup
        title={
          model
            ? t("settings.recognition.listeningWith", { model: model.name })
            : t("settings.recognition.listening")
        }
      >
        {model?.supports_language_selection && (
          <LanguageSelector
            descriptionMode="tooltip"
            grouped
            supportedLanguages={model.supported_languages}
            supportsLanguageDetection={model.supports_language_detection}
          />
        )}
        <CustomWords descriptionMode="tooltip" grouped />
        <FillerWordRemoval descriptionMode="tooltip" grouped />
        {/* Only matters for Chinese speech; SpeakEase is Vietnamese and
            English first. */}
        {language.startsWith("zh") && (
          <ChineseScriptSetting descriptionMode="tooltip" grouped />
        )}
        {model?.supports_translation && (
          <TranslateToEnglish descriptionMode="tooltip" grouped />
        )}
        <ModelUnloadTimeoutSetting descriptionMode="tooltip" grouped />
      </SettingsGroup>

      <section className="space-y-2">
        <h2 className="px-4 text-xs font-semibold text-mid-gray uppercase tracking-wide">
          {t("settings.recognition.models")}
        </h2>
        <p className="px-4 text-xs text-mid-gray">
          {t("settings.models.description")}
        </p>
        <ModelsSettings />
      </section>
    </div>
  );
};
