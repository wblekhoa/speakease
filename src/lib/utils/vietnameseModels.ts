import type { ModelInfo } from "@/bindings";

/**
 * SpeakEase: how the models that read Vietnamese did on Vietnamese.
 *
 * Measured 09/10/2026 on this app's own engine: 60 read-aloud sentences
 * (12.9 min) from Google FLEURS vi_vn test, word error rate after lower-
 * casing and stripping punctuation. Lower is better. Moonshine failed the
 * two clips over ~25 s, so its rate covers 58 of the 60.
 *
 * Keyed by the Hugging Face repo, the part of the model id before the file;
 * `key` names the Vietnamese description in `vietnameseModels.*`.
 */
const MEASURED: Record<string, { wer: number; key: string }> = {
  "handy-computer/cohere-transcribe-03-2026-gguf": { wer: 6.3, key: "cohere" },
  "handy-computer/Qwen3-ASR-1.7B-gguf": { wer: 6.8, key: "qwen3_17b" },
  "handy-computer/Fun-ASR-MLT-Nano-2512-gguf": { wer: 7.4, key: "funasr" },
  "handy-computer/moonshine-base-vi-gguf": { wer: 7.8, key: "moonshine_vi" },
  "handy-computer/whisper-large-v3-turbo-gguf": {
    wer: 8.2,
    key: "whisper_turbo",
  },
  "handy-computer/Qwen3-ASR-0.6B-gguf": { wer: 8.5, key: "qwen3_06b" },
  "handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf": {
    wer: 11.7,
    key: "nemotron",
  },
};

const BEST_WER = Math.min(...Object.values(MEASURED).map((m) => m.wer));

const repoOf = (model: ModelInfo) =>
  model.id.includes("/")
    ? model.id.slice(0, model.id.lastIndexOf("/"))
    : model.id;

export const vietnameseResult = (model: ModelInfo) => {
  const measured = MEASURED[repoOf(model)];
  return measured ? { ...measured, best: measured.wer === BEST_WER } : null;
};
