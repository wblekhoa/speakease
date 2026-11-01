import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface MeetingLiveLevelProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

// SE-MEET-005
/** The live level a meeting starts at; the meeting bar changes it for one
 *  meeting. */
export const MeetingLiveLevel: React.FC<MeetingLiveLevelProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const options = [1, 2, 3, 4, 5].map((n) => ({
      value: String(n),
      label: t(`meeting.live.levels.${n}`),
    }));

    return (
      <SettingContainer
        title={t("settings.recording.meetingLive.title")}
        description={t("settings.recording.meetingLive.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={options}
          selectedValue={String(getSetting("meeting_live_level") ?? 1)}
          onSelect={(value) =>
            updateSetting("meeting_live_level", Number(value))
          }
          disabled={isUpdating("meeting_live_level")}
        />
      </SettingContainer>
    );
  },
);
