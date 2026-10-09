import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface TranslateToEnglishProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const TranslateToEnglish: React.FC<TranslateToEnglishProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const translateToEnglish = getSetting("translate_to_english") || false;
    // SpeakEase: the main shortcut's AI translation (Speak page) already
    // translates; the two exclude each other (settings.rs).
    const aiTranslates =
      Boolean(getSetting("post_process_enabled")) &&
      Boolean(getSetting("speakease_translate_target"));

    return (
      <ToggleSwitch
        checked={translateToEnglish && !aiTranslates}
        disabled={aiTranslates}
        onChange={(enabled) => updateSetting("translate_to_english", enabled)}
        isUpdating={isUpdating("translate_to_english")}
        label={t("settings.advanced.translateToEnglish.label")}
        description={
          aiTranslates
            ? t("settings.advanced.translateToEnglish.aiTranslates")
            : t("settings.advanced.translateToEnglish.description")
        }
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
