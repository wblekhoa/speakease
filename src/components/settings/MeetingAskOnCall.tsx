import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface MeetingAskOnCallProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

// SE-MEET-023
/** Whether a call app taking the microphone asks "Take notes of this call?"
 *  on the meeting bar. On unless the user turned it off. */
export const MeetingAskOnCall: React.FC<MeetingAskOnCallProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    return (
      <ToggleSwitch
        checked={getSetting("meeting_ask_on_call") ?? true}
        onChange={(enabled) => updateSetting("meeting_ask_on_call", enabled)}
        isUpdating={isUpdating("meeting_ask_on_call")}
        label={t("settings.recording.meetingAsk.title")}
        description={t("settings.recording.meetingAsk.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
