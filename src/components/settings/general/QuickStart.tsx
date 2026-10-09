import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MagicStarIcon, MicrophoneIcon, TranslateIcon } from "../../icons/bulk";
import { commands, events, type HistoryStats } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useSettings } from "../../../hooks/useSettings";

// SpeakEase: the top of the General page answers "what do I press?" before
// any setting does. One row per shortcut, its keys drawn as keycaps, and
// what the user has dictated so far underneath.

const ROWS = [
  { id: "transcribe", icon: MicrophoneIcon, needsAi: false },
  { id: "transcribe_with_post_process", icon: MagicStarIcon, needsAi: true },
  { id: "transcribe_translate", icon: TranslateIcon, needsAi: true },
] as const;

/** The Mac's own key symbols, as printed on the keyboard. */
const MAC_SYMBOLS: Record<string, string> = {
  Command: "⌘",
  Option: "⌥",
  Shift: "⇧",
  Control: "⌃",
  Space: "Space",
  Escape: "esc",
};

const Keycaps: React.FC<{ combo: string; mac: boolean }> = ({ combo, mac }) => (
  <span className="flex items-center gap-1">
    {combo.split(" + ").map((key) => (
      <kbd
        key={key}
        className="min-w-7 h-6 px-1.5 inline-flex items-center justify-center rounded-md border border-mid-gray/30 bg-mid-gray/10 font-sans text-xs font-medium shadow-[0_1px_0_color-mix(in_srgb,var(--color-mid-gray)_60%,transparent)]"
      >
        {mac ? (MAC_SYMBOLS[key] ?? key) : key}
      </kbd>
    ))}
  </span>
);

export const QuickStart: React.FC = () => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const [stats, setStats] = useState<HistoryStats | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await commands.getHistoryStats();
      if (result.status === "ok") setStats(result.data);
    };
    load();
    const unlisten = events.historyUpdatePayload.listen(() => load());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const aiOn = settings?.post_process_enabled ?? false;

  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">
          {t("quickStart.title", { defaultValue: "Start talking" })}
        </h2>
        <p className="text-sm text-text/60">
          {t("quickStart.subtitle", {
            defaultValue:
              "Hold a shortcut, speak, let go: the text lands where your cursor is.",
          })}
        </p>
      </div>
      <ul className="space-y-2">
        {ROWS.filter((row) => aiOn || !row.needsAi).map(
          ({ id, icon: Icon }) => {
            const binding = settings?.bindings?.[id]?.current_binding ?? "";
            return (
              <li key={id} className="flex items-center gap-3">
                <Icon
                  className="w-4 h-4 shrink-0 text-logo-primary"
                  aria-hidden
                />
                <span className="flex-1 text-sm">
                  {t(`quickStart.rows.${id}`, {
                    defaultValue:
                      id === "transcribe"
                        ? "Dictate"
                        : id === "transcribe_translate"
                          ? "Dictate in English"
                          : "Dictate, then let AI tidy it",
                  })}
                </span>
                {binding && (
                  <Keycaps
                    combo={formatKeyCombination(binding, osType)}
                    mac={osType === "macos"}
                  />
                )}
              </li>
            );
          },
        )}
      </ul>
      {stats && stats.entries > 0 && (
        <p className="pt-2 border-t border-mid-gray/20 text-xs text-text/60 tabular-nums">
          {t("settings.history.stats", {
            entries: stats.entries.toLocaleString(),
            words: stats.words.toLocaleString(),
            minutes: stats.minutes_saved.toLocaleString(),
          })}
        </p>
      )}
    </section>
  );
};
