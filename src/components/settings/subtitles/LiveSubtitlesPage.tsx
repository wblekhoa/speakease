import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, type RunningApp, type SubtitleState } from "@/bindings";
import { useSettings } from "../../../hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { Dropdown } from "../../ui/Dropdown";
import { Keycaps } from "../../ui/Keycaps";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { InfoTip } from "../../ui/InfoTip";
import { TRANSLATE_TARGETS, translateTargetName } from "@/lib/translateTargets";
import { subtitleErrorKey } from "@/lib/liveSubtitles";
import { openSection } from "@/lib/navigation";
import { CheckIcon, TranslateIcon } from "../../icons/bulk";

/** How often the app list is refreshed while the page is open, so an app
 * that starts playing moves to the top. */
const APPS_REFRESH_MS = 5000;

// SE-LIVE-001
/**
 * Live subtitles (beta, behind Experimental): its own page, because it is
 * used differently from dictation - you pick something another app plays,
 * not your own voice. Pick the app, the language it speaks and the one to
 * read, then start; the tray item and the shortcut start the same choice.
 */
export const LiveSubtitlesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const { settings, getSetting, updateSetting } = useSettings();
  const [hasLocalModel, setHasLocalModel] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [apps, setApps] = useState<RunningApp[]>([]);
  const [state, setState] = useState<SubtitleState | null>(null);
  const [app, setApp] = useState<string | null>(null);
  // null until settings arrive, so a later settings refresh cannot undo
  // the user's pick (audit, 21/10).
  const [pickedSource, setSource] = useState<string | null>(null);
  const source = pickedSource ?? "English";
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshApps = useCallback(async () => {
    setApps(await commands.liveSubtitleApps());
  }, []);

  useEffect(() => {
    commands.liveSubtitlesSupported().then(setSupported);
    commands.liveSubtitlesState().then(setState);
    const checkModel = () =>
      commands
        .hasLocalAiModel()
        .then(setHasLocalModel)
        .catch(() => {});
    checkModel();
    const stop = listen<SubtitleState>("live-subtitles-state", (event) => {
      setState(event.payload);
      if (event.payload.error) setError(event.payload.error);
    });
    const stopModels = listen("ai-models-updated", checkModel);
    return () => {
      stop.then((unlisten) => unlisten());
      stopModels.then((unlisten) => unlisten());
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
    setSource((current) => current ?? settings.live_subtitle_source ?? null);
    setTarget((current) => current ?? settings.live_subtitle_target ?? null);
  }, [settings]);

  if (supported === null) return null;
  if (!supported) {
    return (
      <div className="max-w-3xl w-full mx-auto">
        <p className="rounded-2xl border border-hairline bg-surface px-5 py-4 text-sm">
          {t("subtitles.errors.unsupported")}
        </p>
      </div>
    );
  }

  const languageLabel = (value: string) =>
    translateTargetName(value, i18n.language);
  const translator = getSetting("live_subtitle_translator") ?? "auto";
  const translatorOptions = [
    {
      value: "auto",
      label: t("subtitles.translator.auto"),
      description: t("subtitles.translator.autoHint"),
    },
    { value: "apple", label: t("subtitles.translator.apple") },
    { value: "local", label: t("subtitles.translator.local") },
  ];

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
  const rows: RunningApp[] =
    app && !apps.some((item) => item.bundle_id === app)
      ? [{ bundle_id: app, name: app, playing: false }, ...apps]
      : apps;

  const running = state?.running ?? false;
  const appName = (bundleId?: string | null) =>
    rows.find((item) => item.bundle_id === bundleId)?.name ?? bundleId ?? "";
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
    <div className="max-w-3xl w-full mx-auto space-y-6">
      {/* Start or stop, and what is happening now. */}
      <section className="rounded-2xl border border-hairline bg-surface px-5 py-4 flex items-center gap-4">
        <span
          aria-hidden
          className={`grid place-items-center size-11 shrink-0 rounded-2xl ${
            running
              ? "bg-logo-primary text-white"
              : "bg-logo-primary/12 text-logo-primary"
          }`}
        >
          <TranslateIcon width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">
              {running
                ? t("speak.subtitles.onTitle", {
                    app: appName(state?.bundle_id),
                  })
                : t("speak.subtitles.title")}
            </h2>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-logo-primary/15 text-logo-primary">
              {t("speak.subtitles.beta")}
            </span>
            <InfoTip>
              <ul className="space-y-2.5">
                {(
                  [
                    "noteDevice",
                    "noteContext",
                    "noteHistory",
                    "notePermission",
                  ] as const
                ).map((key) => (
                  <li key={key} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-[7px] size-1 shrink-0 rounded-full bg-logo-primary"
                    />
                    <span>{t(`speak.subtitles.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </InfoTip>
          </div>
          <p className="text-sm text-mid-gray" role="status">
            {error
              ? t(`subtitles.errors.${subtitleErrorKey(error)}`, {
                  app: appName(app) || t("subtitles.theApp"),
                })
              : running
                ? t("speak.subtitles.on")
                : app
                  ? t("speak.subtitles.ready", { app: appName(app) })
                  : t("speak.subtitles.pickFirst")}
          </p>
          {binding && (
            <p className="text-xs text-mid-gray flex items-center gap-1.5 pt-1">
              {t("speak.subtitles.shortcut")}
              <Keycaps combination={binding} osType={osType} />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={!running && !app}
          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-logo-primary ${
            running
              ? "border border-hairline hover:bg-row"
              : "text-white bg-background-ui hover:bg-brand-deep"
          }`}
        >
          {running ? t("speak.subtitles.stop") : t("speak.subtitles.start")}
        </button>
      </section>

      {/* Which app to listen to: running apps, those playing first. */}
      <SettingsGroup
        title={t("speak.subtitles.app")}
        info={t("speak.subtitles.appHint")}
      >
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-mid-gray">
            {t("speak.subtitles.noApps")}
          </p>
        ) : (
          <div role="radiogroup" aria-label={t("speak.subtitles.app")}>
            {rows.map((item) => {
              const chosen = item.bundle_id === app;
              return (
                <button
                  key={item.bundle_id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={running}
                  onClick={() => setApp(item.bundle_id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-start text-sm cursor-pointer hover:bg-row/60 disabled:cursor-not-allowed disabled:opacity-60 border-b border-hairline last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-logo-primary"
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.playing && (
                    <span className="flex items-center gap-1.5 text-xs text-logo-primary">
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-logo-primary"
                      />
                      {t("speak.subtitles.playing")}
                    </span>
                  )}
                  <span className="w-4 shrink-0 text-logo-primary">
                    {chosen && <CheckIcon width={16} height={16} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </SettingsGroup>

      {/* The language spoken and the one to read. */}
      <SettingsGroup title={t("speak.subtitles.languages")}>
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-3">
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
          <span aria-hidden className="hidden sm:block pb-2 text-mid-gray">
            →
          </span>
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
        {/* SE-LIVE-015: which AI translates. */}
        <div className="px-4 pb-3 space-y-1">
          <span className="block text-xs text-mid-gray">
            {t("subtitles.translator.label")}
          </span>
          <Dropdown
            options={translatorOptions}
            selectedValue={translator}
            onSelect={(value) =>
              updateSetting("live_subtitle_translator", value)
            }
            disabled={running}
          />
          {translator === "local" && !hasLocalModel && (
            <p className="text-xs text-mid-gray">
              {t("subtitles.translator.noLocalModel")}{" "}
              <button
                type="button"
                onClick={() => openSection("postprocessing")}
                className="text-logo-primary hover:underline cursor-pointer"
              >
                {t("subtitles.translator.openModels")}
              </button>
            </p>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
};
