import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { commands } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { useSettings } from "../../../hooks/useSettings";
import { ShortcutInput } from "../ShortcutInput";
import { ShortcutActivationSetting } from "../ShortcutActivation";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ChannelSelector } from "../ChannelSelector";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { VoiceActivityDetection } from "../VoiceActivityDetection";
import { AudioFeedback } from "../AudioFeedback";
import { SoundPicker } from "../SoundPicker";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { VolumeSlider } from "../VolumeSlider";
import { ShowOverlay } from "../ShowOverlay";

// SpeakEase's Recording page: everything up to the moment the words are
// captured. Every shortcut lives here, each saying what it does; the two AI
// shortcuts only while AI is on (they are not registered otherwise).
export const RecordingSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, audioFeedbackEnabled } = useSettings();
  const isLinux = type() === "linux";
  const aiEnabled = getSetting("post_process_enabled") ?? false;
  const experimental = getSetting("experimental_enabled") ?? false;
  // Live subtitles and meeting notes hear another app: macOS 14.2+ only
  // (settings.rs app_audio_features_on).
  const [canTapApps, setCanTapApps] = useState(false);
  useEffect(() => {
    commands.liveSubtitlesSupported().then(setCanTapApps);
  }, []);
  const appAudio = experimental && !isLinux && canTapApps;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.recording.shortcuts")}>
        <ShortcutInput
          shortcutId="transcribe"
          descriptionMode="inline"
          grouped
        />
        {aiEnabled && (
          <ShortcutInput
            shortcutId="transcribe_translate"
            descriptionMode="inline"
            grouped
          />
        )}
        {aiEnabled && (
          <ShortcutInput
            shortcutId="transcribe_with_post_process"
            descriptionMode="inline"
            grouped
          />
        )}
        {/* Live subtitles (beta) register only with Experimental on. */}
        {appAudio && (
          <ShortcutInput
            shortcutId="live_subtitles"
            descriptionMode="inline"
            grouped
          />
        )}
        {/* Meeting notes (beta), the same way. */}
        {appAudio && (
          <ShortcutInput
            shortcutId="meeting_notes"
            descriptionMode="inline"
            grouped
          />
        )}
        {/* Cancel shortcut remains hidden on Linux because of dynamic shortcut instability. */}
        {!isLinux && (
          <ShortcutInput shortcutId="cancel" descriptionMode="inline" grouped />
        )}
        <ShortcutActivationSetting descriptionMode="tooltip" grouped />
      </SettingsGroup>

      <SettingsGroup title={t("settings.recording.microphone")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped />
        <ChannelSelector descriptionMode="tooltip" grouped />
        <MuteWhileRecording descriptionMode="tooltip" grouped />
        <VoiceActivityDetection descriptionMode="tooltip" grouped />
      </SettingsGroup>

      <SettingsGroup title={t("settings.recording.feedback")}>
        <ShowOverlay descriptionMode="tooltip" grouped />
        <AudioFeedback descriptionMode="tooltip" grouped />
        <SoundPicker
          label={t("settings.debug.soundTheme.label")}
          description={t("settings.debug.soundTheme.description")}
        />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>
    </div>
  );
};
