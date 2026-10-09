import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ThemeSelector } from "../ThemeSelector";
import { AutostartToggle } from "../AutostartToggle";
import { StartHidden } from "../StartHidden";
import { ShowTrayIcon } from "../ShowTrayIcon";
import { PasteMethodSetting } from "../PasteMethod";
import { TypingToolSetting } from "../TypingTool";
import { ClipboardHandlingSetting } from "../ClipboardHandling";
import { AutoSubmit } from "../AutoSubmit";
import { AppendTrailingSpace } from "../AppendTrailingSpace";
import { ExperimentalToggle } from "../ExperimentalToggle";
import { KeyboardImplementationSelector } from "../debug/KeyboardImplementationSelector";
import { AccelerationSelector } from "../AccelerationSelector";
import { LazyStreamClose } from "../LazyStreamClose";
import { VadBackendSelector } from "../VadBackendSelector";
import { AppDataDirectory } from "../AppDataDirectory";
import { LogDirectory } from "../debug";

/** SpeakEase is built on Handy; its MIT licence asks for the credit. */
const HANDY_SOURCE = "https://github.com/cjpais/Handy";

// SpeakEase's App page: how the app looks, starts and puts text where the
// cursor is, the experimental switches, and what it is (formerly About).
export const AppSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const experimentalEnabled = getSetting("experimental_enabled") || false;
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((error) => console.error("Failed to get app version:", error));
  }, []);

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.app.appearance")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped />
        <ThemeSelector descriptionMode="tooltip" grouped />
      </SettingsGroup>

      <SettingsGroup title={t("settings.app.startup")}>
        <AutostartToggle descriptionMode="tooltip" grouped />
        <StartHidden descriptionMode="tooltip" grouped />
        <ShowTrayIcon descriptionMode="tooltip" grouped />
      </SettingsGroup>

      <SettingsGroup title={t("settings.app.output")}>
        <PasteMethodSetting descriptionMode="tooltip" grouped />
        <TypingToolSetting descriptionMode="tooltip" grouped />
        <ClipboardHandlingSetting descriptionMode="tooltip" grouped />
        <AutoSubmit descriptionMode="tooltip" grouped />
        <AppendTrailingSpace descriptionMode="tooltip" grouped />
      </SettingsGroup>

      <SettingsGroup title={t("settings.advanced.groups.experimental")}>
        <ExperimentalToggle descriptionMode="tooltip" grouped />
        {experimentalEnabled && (
          <>
            <KeyboardImplementationSelector descriptionMode="tooltip" grouped />
            <AccelerationSelector descriptionMode="tooltip" grouped />
            <LazyStreamClose descriptionMode="tooltip" grouped />
            <VadBackendSelector descriptionMode="tooltip" grouped />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("settings.app.about")}>
        <SettingContainer
          title={t("settings.about.version.title")}
          description={t("settings.about.version.description")}
          grouped
        >
          {version && (
            // eslint-disable-next-line i18next/no-literal-string
            <span className="text-sm font-mono">v{version}</span>
          )}
        </SettingContainer>
        <AppDataDirectory descriptionMode="tooltip" grouped />
        <LogDirectory grouped />
        <SettingContainer
          title={t("settings.app.credits.title")}
          description={t("settings.app.credits.description")}
          descriptionMode="inline"
          grouped
        >
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl(HANDY_SOURCE)}
          >
            {t("settings.app.credits.button")}
          </Button>
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};
