import React from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import {
  ClockIcon,
  CpuIcon,
  KeyboardIcon,
  MagicStarIcon,
  MicrophoneIcon,
  ReadingSettingsIcon,
  SidebarIcon,
} from "./icons/bulk";
import HandyTextLogo from "./icons/HandyTextLogo";
import { IconTip } from "./ui/IconTip";
import { useSettings } from "../hooks/useSettings";
import {
  SpeakPage,
  HistorySettings,
  RecordingSettings,
  RecognitionSettings,
  PostProcessingSettings,
  AppSettings,
  DebugSettings,
} from "./settings";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
  /** Sections under the "Settings" caption; the rest are for using the app. */
  settings?: boolean;
}

// SpeakEase's sections. Speak and History are where the app is used; the
// settings follow a dictation from start to end: recording it, turning it
// into words, AI on the words, and the app around it.
export const SECTIONS_CONFIG = {
  speak: {
    labelKey: "sidebar.speak",
    icon: MicrophoneIcon,
    component: SpeakPage,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: ClockIcon,
    component: HistorySettings,
    enabled: () => true,
  },
  recording: {
    labelKey: "sidebar.recording",
    icon: KeyboardIcon,
    component: RecordingSettings,
    enabled: () => true,
    settings: true,
  },
  recognition: {
    labelKey: "sidebar.recognition",
    icon: CpuIcon,
    component: RecognitionSettings,
    enabled: () => true,
    settings: true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: MagicStarIcon,
    component: PostProcessingSettings,
    enabled: () => true,
    settings: true,
  },
  app: {
    labelKey: "sidebar.app",
    icon: ReadingSettingsIcon,
    component: AppSettings,
    enabled: () => true,
    settings: true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
    settings: true,
  },
} as const satisfies Record<string, SectionConfig>;

export const isSidebarSection = (value: unknown): value is SidebarSection =>
  typeof value === "string" && value in SECTIONS_CONFIG;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** The Mac's window buttons sit in the column's first 72px (lib.rs: x 20,
 * three lights, 52 wide). Only the Mac app has them in the page; a browser
 * preview leaves no hole. */
const LIGHTS_IN_PAGE =
  "__TAURI_INTERNALS__" in window &&
  !("__SPEAKEASE_PREVIEW__" in window) &&
  navigator.userAgent.includes("Mac");

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
  collapsed,
  onToggleCollapsed,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  const toggleLabel = collapsed
    ? t("sidebar.expand", { defaultValue: "Show sidebar" })
    : t("sidebar.collapse", { defaultValue: "Hide sidebar" });

  const toggle = (
    <IconTip label={toggleLabel} side={collapsed ? "right" : "bottom"}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        className="p-1.5 rounded-lg text-mid-gray hover:text-text hover:bg-glass-hover transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-logo-primary"
      >
        <SidebarIcon />
      </button>
    </IconTip>
  );

  return (
    // ReadEase's side column: flush with the window's left edge, the Mac's
    // sidebar material showing through it (App.css .side-panel), the window
    // buttons in its top-left corner and the collapse switch at the far end
    // of that 60px row - the content toolbar's line. Folded, it keeps a
    // column of icons.
    <nav
      aria-label={t("sidebar.label", { defaultValue: "Sections" })}
      className={`side-panel shrink-0 flex flex-col h-full ${collapsed ? "w-[76px]" : "w-52"}`}
    >
      <div
        data-tauri-drag-region
        className={`flex h-[60px] shrink-0 items-center ${
          collapsed ? "justify-center" : "justify-end pe-2"
        } ${LIGHTS_IN_PAGE && !collapsed ? "ps-[84px]" : "ps-2"}`}
      >
        {!collapsed && toggle}
      </div>
      {collapsed ? (
        <div className="flex justify-center pb-2">{toggle}</div>
      ) : (
        <HandyTextLogo width={124} className="mx-4 mt-1 mb-4" />
      )}
      <div className="flex flex-col w-full gap-0.5 px-2.5 overflow-y-auto">
        {availableSections.map((section, index) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const label = t(section.labelKey);
          const isSettings = "settings" in section && section.settings;
          const previous = availableSections[index - 1];
          const startsSettings =
            isSettings &&
            !(previous && "settings" in previous && previous.settings);

          return (
            <React.Fragment key={section.id}>
              {startsSettings &&
                (collapsed ? (
                  <div
                    role="separator"
                    className="mx-3 my-2 border-t border-hairline"
                  />
                ) : (
                  <h2 className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
                    {t("sidebar.settingsGroup")}
                  </h2>
                ))}
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                aria-label={collapsed ? label : undefined}
                // Folded, only the icon shows; the scroll box would clip an
                // IconTip, so the native title names it.
                title={collapsed ? label : undefined}
                className={`flex gap-2.5 items-center rounded-xl text-start cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-logo-primary ${
                  // Folded, each section is a square key around its icon.
                  collapsed
                    ? "size-11 shrink-0 self-center justify-center"
                    : "w-full py-2 px-3"
                } ${
                  isActive
                    ? "bg-glass-chosen text-text"
                    : "text-text/80 hover:bg-glass-hover"
                }`}
                onClick={() => onSectionChange(section.id)}
              >
                <Icon
                  width={20}
                  height={20}
                  className={`shrink-0 ${isActive ? "text-text" : "text-mid-gray"}`}
                />
                {!collapsed && (
                  <span className="text-sm truncate">{label}</span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
