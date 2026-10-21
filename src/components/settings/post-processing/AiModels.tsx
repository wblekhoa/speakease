import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { commands, type AiModelInfo, type ModelInfo } from "@/bindings";
import ModelCard, {
  type ModelCardStatus,
} from "@/components/onboarding/ModelCard";
import { CheckIcon } from "@/components/icons/bulk";
import { formatModelSize } from "@/lib/utils/format";

/** A download's progress (local_ai.rs, the speech models' payload). */
interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

/** The recommended slots, in the order the cards show them. */
const PICK_SLOTS = ["balanced", "best", "light"] as const;

/**
 * The speech models' card shows a ModelInfo; an on-device AI model fills
 * the fields it reads (its bars, size, name and description) and leaves the
 * speech-only ones empty, so the two lists look and behave the same.
 */
const asCardModel = (model: AiModelInfo, description: string): ModelInfo => ({
  id: `ai:${model.id}`,
  name: model.name,
  description,
  filename: "",
  source: { HuggingFace: { repo_id: `ai/${model.id}`, revision: "" } },
  size_mb: model.size_mb,
  is_downloaded: model.is_downloaded,
  is_downloading: model.is_downloading,
  partial_size: model.partial_mb,
  is_directory: false,
  engine_type: "TranscribeCpp",
  accuracy_score: model.accuracy_score / 100,
  speed_score: model.speed_score / 100,
  supports_translation: false,
  is_recommended: false,
  supported_languages: [],
  supports_language_selection: false,
  is_custom: false,
  supports_streaming: false,
  supports_language_detection: false,
});

const fromCardId = (cardId: string) => cardId.replace(/^ai:/, "");

/**
 * SpeakEase: the on-device AI models (local_ai.rs), laid out like the
 * speech models (owner, 21/10): three picks for this Mac, the models
 * downloaded, and the ones to download - those over 5 GB marked heavy.
 */
export const AiModels: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [verifying, setVerifying] = useState<Set<string>>(new Set());
  const [memoryGb, setMemoryGb] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    commands
      .listAiModels()
      .then(setModels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    commands
      .macMemoryGb()
      .then(setMemoryGb)
      .catch(() => {});
    const subscriptions = [
      listen("ai-models-updated", refresh),
      listen<DownloadProgress>("ai-model-download-progress", (event) =>
        setProgress((current) => ({
          ...current,
          [event.payload.model_id]: event.payload.percentage,
        })),
      ),
      listen<string>("ai-model-verification-started", (event) =>
        setVerifying((current) => new Set(current).add(event.payload)),
      ),
      listen<string>("ai-model-verification-completed", (event) =>
        setVerifying((current) => {
          const next = new Set(current);
          next.delete(event.payload);
          return next;
        }),
      ),
      listen<{ model_id: string; error: string }>(
        "ai-model-download-failed",
        (event) => setError(event.payload.error),
      ),
    ];
    return () => {
      subscriptions.forEach((p) => p.then((stop) => stop()));
    };
  }, [refresh]);

  const statusOf = (model: AiModelInfo): ModelCardStatus => {
    if (model.is_active) return "active";
    if (verifying.has(model.id)) return "verifying";
    if (model.is_downloading) return "downloading";
    return model.is_downloaded ? "available" : "downloadable";
  };

  const download = (id: string) => {
    setError(null);
    commands.downloadAiModel(id).then((result) => {
      if (result.status === "error") setError(result.error);
    });
  };

  const use = (id: string) => {
    commands.setActiveAiModel(id).then(refresh);
  };

  const remove = async (id: string) => {
    const model = models.find((m) => m.id === id);
    if (!model) return;
    const confirmed = await ask(
      t("settings.models.deleteConfirm", { modelName: model.name }),
      { title: t("settings.models.deleteTitle"), kind: "warning" },
    );
    if (confirmed) await commands.deleteAiModel(id);
  };

  const describe = (model: AiModelInfo) => {
    const text = t(`aiModels.models.${model.id}`, { defaultValue: "" });
    const ram = t("aiModels.ram", {
      size: formatModelSize(model.ram_mb, i18n.language),
    });
    return [text, ram].filter(Boolean).join(" ");
  };

  // Heavier than half of this Mac's memory: say so before a download.
  const tooHeavy = (model: AiModelInfo) =>
    memoryGb > 0 && model.ram_mb / 1024 > memoryGb / 2;

  const pickAction = (model: AiModelInfo) => {
    const status = statusOf(model);
    if (status === "active") {
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-logo-primary">
          <CheckIcon width={14} height={14} />
          {t("settings.models.picks.active")}
        </span>
      );
    }
    if (status === "downloading" || status === "verifying") {
      return (
        <span className="text-xs font-medium text-mid-gray tabular-nums">
          {t("settings.models.picks.downloading", {
            percent: Math.round(progress[model.id] ?? 0),
          })}
        </span>
      );
    }
    const isDownload = status === "downloadable";
    return (
      <button
        type="button"
        onClick={() => (isDownload ? download(model.id) : use(model.id))}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-logo-primary ${
          isDownload
            ? "bg-row text-text hover:bg-logo-primary/15 hover:text-logo-primary"
            : "bg-background-ui text-white hover:bg-brand-deep"
        }`}
      >
        {isDownload
          ? t("settings.models.picks.download")
          : t("settings.models.picks.use")}
      </button>
    );
  };

  const picks = PICK_SLOTS.map((slot) =>
    models.find((model) => model.pick === slot),
  ).filter((model): model is AiModelInfo => Boolean(model));
  const downloaded = models.filter((model) => model.is_downloaded);
  const available = models.filter((model) => !model.is_downloaded);

  const card = (model: AiModelInfo) => (
    <ModelCard
      key={model.id}
      model={asCardModel(model, describe(model))}
      status={statusOf(model)}
      showRecommended={false}
      onSelect={(cardId) => {
        const id = fromCardId(cardId);
        if (model.is_downloaded) use(id);
        else download(id);
      }}
      onDownload={(cardId) => download(fromCardId(cardId))}
      onDelete={(cardId) => void remove(fromCardId(cardId))}
      onCancel={(cardId) => commands.cancelAiModelDownload(fromCardId(cardId))}
      downloadProgress={progress[model.id]}
    />
  );

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-text">
            {t("aiModels.picksTitle")}
          </h3>
          {memoryGb > 0 && (
            <span className="shrink-0 rounded-full bg-row px-2.5 py-1 text-xs text-mid-gray tabular-nums">
              {t("aiModels.thisMac", { size: memoryGb })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {picks.map((model) => (
            <div
              key={model.id}
              className={`flex flex-col gap-1.5 rounded-2xl border bg-surface p-3.5 ${
                model.is_active ? "border-logo-primary" : "border-hairline"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-logo-primary">
                {t(`aiModels.picks.${model.pick}.label`)}
              </span>
              <span className="text-sm font-semibold truncate">
                {model.name}
              </span>
              <span className="text-xs leading-snug text-mid-gray">
                {tooHeavy(model)
                  ? t("aiModels.tooHeavy")
                  : t(`aiModels.picks.${model.pick}.why`)}
              </span>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                <span className="text-xs text-mid-gray tabular-nums truncate">
                  {formatModelSize(model.size_mb, i18n.language)}
                </span>
                {pickAction(model)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-text">
          {t("aiModels.downloadFailed", { error })}
        </p>
      )}

      {downloaded.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text">
            {t("settings.models.yourModels")}
          </h3>
          <div className="space-y-2">{downloaded.map(card)}</div>
        </section>
      )}

      {available.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text">
            {t("settings.models.availableModels")}
          </h3>
          <div className="space-y-2">{available.map(card)}</div>
        </section>
      )}
    </div>
  );
};
