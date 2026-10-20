import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, type RunningApp, type SubtitleState } from "@/bindings";
import { useSettings } from "../../../hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { Dropdown } from "../../ui/Dropdown";
import { Keycaps } from "../../ui/Keycaps";
import { TRANSLATE_TARGETS, translateTargetName } from "@/lib/translateTargets";
import { subtitleErrorKey } from "@/lib/liveSubtitles";
import { TranslateIcon } from "../../icons/bulk";

/** How often the app list is refreshed while the page is open, so an app
 * that starts playing moves to the top. */
const APPS_REFRESH_MS = 5000;

// SE-LIVE-001
/**
 * Live subtitles (beta, behind Experimental): pick an app, the language it
 * speaks and the one to read, then start. The same choice is what the tray
 * item and the shortcut start next time.
 */
export const LiveSubtitlesCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const { settings, getSetting } = useSettings();
  const [supported, setSupported] = useState(false);
  const [apps, setApps] = useState<RunningApp[]>([]);
  const [state, setState] = useState<SubtitleState | null>(null);
  const [app, setApp] = useState<string | null>(null);
  const [source, setSource] = useState("English");
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshApps = useCallback(async () => {
    setApps(await commands.liveSubtitleApps());
  }, []);

  useEffect(() => {
    commands.liveSubtitlesSupported().then(setSupported);
    commands.liveSubtitlesState().then(setState);
    const stop = listen<SubtitleState>("live-subtitles-state", (event) => {
      setState(event.payload);
      if (event.payload.error) setError(event.payload.error);
    });
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    refreshApps();
    const timer = setInterval(refreshApps, APPS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [supported, refreshApps]);

  // The remembered choice, once settings arrive.
  useEffect(() => {
    if (!settings) return;
    setApp((current) => current ?? settings.live_subtitle_app ?? null);
    setSource((current) => settings.live_subtitle_source ?? current);
    setTarget((current) => current ?? settings.live_subtitle_target ?? null);
  }, [settings]);

  if (!supported) return null;

  const languageLabel = (value: string) =>
    translateTargetName(value, i18n.language);
  const languages = TRANSLATE_TARGETS.map((item) => ({
    value: item.value,
    label: `${languageLabel(item.value)} — ${item.code}`,
  }));
  // The shared translate language, unless that is the language spoken.
  const shared = settings?.speakease_translate_language ?? "English";
  const chosenTarget =
    target ??
    (shared === source
      ? source === "Vietnamese"
        ? "English"
        : "Vietnamese"
      : shared);

  // A remembered app that is not running still shows, so the choice is kept.
  const options = apps.map((item) => ({
    value: item.bundle_id,
    label: item.playing
      ? `${item.name} · ${t("speak.subtitles.playing")}`
      : item.name,
  }));
  if (app && !apps.some((item) => item.bundle_id === app)) {
    options.unshift({ value: app, label: app });
  }

  const running = state?.running ?? false;
  const runningName =
    apps.find((item) => item.bundle_id === state?.bundle_id)?.name ??
    state?.bundle_id ??
    "";
  const binding = getSetting("bindings")?.live_subtitles?.current_binding;

  const toggle = async () => {
    setError(null);
    if (running) {
      await commands.stopLiveSubtitles();
      return;
    }
    if (!app) return;
    const result = await commands.startLiveSubtitles(app, source, chosenTarget);
    if (result.status === "error") setError(result.error);
  };

  return (
    <section
      aria-label={t("speak.subtitles.title")}
      className="w-full max-w-2xl rounded-2xl border border-hairline bg-surface px-4 py-3 space-y-3 text-start"
    >
      <div className="flex items-center gap-2">
        <TranslateIcon
          width={18}
          height={18}
          className="text-logo-primary shrink-0"
        />
        <h2 className="text-sm font-semibold">{t("speak.subtitles.title")}</h2>
        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-logo-primary/15 text-logo-primary">
          {t("speak.subtitles.beta")}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={!running && !app}
          className={`ms-auto px-3 py-1.5 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-logo-primary ${
            running
              ? "border border-hairline hover:bg-row"
              : "text-white bg-background-ui hover:bg-brand-deep"
          }`}
        >
          {running ? t("speak.subtitles.stop") : t("speak.subtitles.start")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-mid-gray">
            {t("speak.subtitles.app")}
          </span>
          <Dropdown
            options={options}
            selectedValue={app}
            onSelect={setApp}
            onOpen={refreshApps}
            disabled={running}
            placeholder={t("speak.subtitles.pickApp")}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-mid-gray">
            {t("speak.subtitles.from")}
          </span>
          <Dropdown
            options={languages}
            selectedValue={source}
            onSelect={setSource}
            disabled={running}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-mid-gray">
            {t("speak.subtitles.to")}
          </span>
          <Dropdown
            options={languages}
            selectedValue={chosenTarget}
            onSelect={setTarget}
            disabled={running}
          />
        </label>
      </div>

      <p className="text-xs text-mid-gray" role="status">
        {error
          ? t(`subtitles.errors.${subtitleErrorKey(error)}`, {
              app: runningName || t("subtitles.theApp"),
            })
          : running
            ? t("speak.subtitles.on", { app: runningName })
            : t("speak.subtitles.hint")}
        {binding && !error && (
          <>
            {" · "}
            <Keycaps combination={binding} osType={osType} />
          </>
        )}
      </p>
    </section>
  );
};
