import type { ModelInfo } from "@/bindings";
import { supportsLanguageCode } from "@/lib/constants/languages";
import { vietnameseResult } from "./vietnameseModels";

/**
 * SpeakEase: the models worth suggesting for one language, each for a
 * different need. Vietnamese is judged on what was measured on it (word
 * error rate on FLEURS, vietnameseModels.ts); every other language on the
 * catalog's own accuracy and speed scores, which are not per language.
 */
export type PickKind = "best" | "balanced" | "live" | "light";

export interface ModelPick {
  kind: PickKind;
  model: ModelInfo;
  /** Word error rate in percent, when it was measured for this language. */
  wer: number | null;
}

/** How much less accurate a model may be and still stand in for the best:
 * word-error points for a measured language, catalog score otherwise. */
const BALANCED_SLACK = { wer: 1.5, score: 0.05 };
const LIGHT_SLACK = { wer: 2.5, score: 0.1 };

export const pickModels = (
  models: ModelInfo[],
  language: string,
): ModelPick[] => {
  if (language === "all") return [];
  const speaks = models.filter((model) =>
    supportsLanguageCode(model.supported_languages, language),
  );

  // Vietnamese: only the measured models, ranked by measured errors.
  const measured = language === "vi";
  const candidates = measured
    ? speaks.filter((model) => vietnameseResult(model))
    : speaks;
  if (candidates.length === 0) return [];

  const werOf = (model: ModelInfo) =>
    measured ? (vietnameseResult(model)?.wer ?? null) : null;
  // One scale where higher is better, for both kinds of evidence.
  const quality = (model: ModelInfo) =>
    measured ? -(werOf(model) ?? 100) : model.accuracy_score;
  const slack = (kind: typeof BALANCED_SLACK) =>
    measured ? kind.wer : kind.score;

  const byQuality = [...candidates].sort((a, b) => quality(b) - quality(a));
  const best = byQuality[0];
  const top = quality(best);
  // Within the slack, strictly: a model exactly at the edge is not "close".
  const near = (tolerance: number) =>
    byQuality.filter((model) => top - quality(model) < tolerance);

  const balanced = [...near(slack(BALANCED_SLACK))]
    .filter((model) => model.id !== best.id)
    .sort((a, b) => b.speed_score - a.speed_score || a.size_mb - b.size_mb)[0];
  const live = byQuality.find((model) => model.supports_streaming);
  const light = [...near(slack(LIGHT_SLACK))].sort(
    (a, b) => a.size_mb - b.size_mb,
  )[0];

  const picks: ModelPick[] = [];
  const add = (kind: PickKind, model: ModelInfo | undefined) => {
    if (!model || picks.some((pick) => pick.model.id === model.id)) return;
    picks.push({ kind, model, wer: werOf(model) });
  };
  add("best", best);
  add("balanced", balanced);
  add("live", live);
  add("light", light);
  return picks;
};
