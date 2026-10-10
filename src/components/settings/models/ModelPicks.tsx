import React from "react";
import { useTranslation } from "react-i18next";
import type { ModelCardStatus } from "@/components/onboarding";
import { CheckIcon } from "@/components/icons/bulk";
import { formatModelSize } from "@/lib/utils/format";
import { languageName } from "@/lib/utils/languageName";
import type { ModelPick } from "@/lib/utils/modelPicks";
import { vietnameseResult } from "@/lib/utils/vietnameseModels";

/** The languages offered when no language is chosen yet: the app's two. */
const QUICK_LANGUAGES = ["vi", "en"] as const;

interface ModelPicksProps {
  language: string;
  picks: ModelPick[];
  statusOf: (modelId: string) => ModelCardStatus;
  progressOf: (modelId: string) => number | undefined;
  onUse: (modelId: string) => void;
  onDownload: (modelId: string) => void;
  onChooseLanguage: (language: string) => void;
}

/**
 * SpeakEase: the models to suggest for the language chosen in the filter,
 * one per need (most accurate, balanced, live text, smallest), each with
 * the one action it needs - use it, or download it (modelPicks.ts).
 */
export const ModelPicks: React.FC<ModelPicksProps> = ({
  language,
  picks,
  statusOf,
  progressOf,
  onUse,
  onDownload,
  onChooseLanguage,
}) => {
  const { t, i18n } = useTranslation();

  if (language === "all") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-hairline px-4 py-3 text-sm text-mid-gray">
        <span>{t("settings.models.picks.chooseLanguage")}</span>
        {QUICK_LANGUAGES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onChooseLanguage(code)}
            className="px-2.5 py-1 rounded-full bg-row text-text text-xs font-medium hover:bg-logo-primary/15 hover:text-logo-primary cursor-pointer"
          >
            {languageName(code, i18n.language) ?? code}
          </button>
        ))}
      </div>
    );
  }
  if (picks.length === 0) return null;

  const measured = picks.some((pick) => pick.wer !== null);
  const languageLabel = languageName(language, i18n.language, true) ?? language;

  const action = (pick: ModelPick) => {
    const id = pick.model.id;
    const status = statusOf(id);
    if (status === "active") {
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-logo-primary">
          <CheckIcon width={14} height={14} />
          {t("settings.models.picks.active")}
        </span>
      );
    }
    if (status === "downloading") {
      return (
        <span className="text-xs font-medium text-mid-gray tabular-nums">
          {t("settings.models.picks.downloading", {
            percent: Math.round(progressOf(id) ?? 0),
          })}
        </span>
      );
    }
    if (status !== "available" && status !== "downloadable") {
      return (
        <span className="text-xs font-medium text-mid-gray">
          {t("settings.models.picks.preparing")}
        </span>
      );
    }
    const download = status === "downloadable";
    return (
      <button
        type="button"
        onClick={() => (download ? onDownload(id) : onUse(id))}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-logo-primary ${
          download
            ? "bg-row text-text hover:bg-logo-primary/15 hover:text-logo-primary"
            : "bg-background-ui text-white hover:bg-brand-deep"
        }`}
      >
        {download
          ? t("settings.models.picks.download")
          : t("settings.models.picks.use")}
      </button>
    );
  };

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-text">
          {t("settings.models.picks.title", { language: languageLabel })}
        </h2>
        <span className="text-xs text-mid-gray text-end">
          {measured
            ? t("settings.models.picks.basisMeasured")
            : t("settings.models.picks.basisCatalog")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {picks.map((pick) => {
          const active = statusOf(pick.model.id) === "active";
          // Moonshine's Vietnamese model failed every clip over ~25 s.
          const shortOnly =
            vietnameseResult(pick.model)?.key === "moonshine_vi";
          return (
            <div
              key={pick.kind}
              className={`flex flex-col gap-1.5 rounded-2xl border bg-surface p-3.5 ${
                active ? "border-logo-primary" : "border-hairline"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-logo-primary">
                {t(`settings.models.picks.${pick.kind}.label`)}
              </span>
              <span className="text-sm font-semibold truncate">
                {pick.model.name}
              </span>
              <span className="text-xs leading-snug text-mid-gray">
                {shortOnly
                  ? t("settings.models.picks.shortOnly")
                  : t(`settings.models.picks.${pick.kind}.why`)}
              </span>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                <span className="text-xs text-mid-gray tabular-nums truncate">
                  {[
                    pick.wer !== null
                      ? t("settings.models.picks.wer", {
                          rate: pick.wer.toLocaleString(i18n.language),
                        })
                      : null,
                    formatModelSize(pick.model.size_mb, i18n.language),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {action(pick)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
