/**
 * A progress bar that never sits still (Files page, SE-FILE-005). The
 * backend reports whole parts (`done` of `total`); between two reports the
 * bar creeps toward the next part's mark at the pace the earlier parts set,
 * slowing as it nears the mark and never reaching it, so a slow part reads
 * as "working", not "stuck", and the bar never runs ahead of the truth.
 */
export interface ProgressSample {
  done: number;
  total: number;
  /** When the work started, and when `done` last changed (ms). */
  startedAt: number;
  stepAt: number;
}

/** The share of the next part the bar may show before it is reported. */
const MAX_CREEP = 0.9;

/** Seconds one part takes, from the parts already done; `fallback` before. */
export const secondsPerPart = (
  sample: ProgressSample,
  fallback: number,
): number =>
  sample.done > 0
    ? // No floor worth a person's attention: reading reports in thousandths.
      Math.max(0.001, (sample.stepAt - sample.startedAt) / 1000 / sample.done)
    : fallback;

/** What to draw at `now`: a fraction 0-1, and an estimate of the seconds
 * left once a part has finished (null before: no pace to go on). */
export function estimateProgress(
  sample: ProgressSample,
  now: number,
  fallbackSecondsPerPart: number,
): { fraction: number; secondsLeft: number | null } {
  const total = Math.max(1, sample.total);
  const done = Math.min(sample.done, total);
  if (done >= total) return { fraction: 1, secondsLeft: 0 };
  const pace = secondsPerPart(sample, fallbackSecondsPerPart);
  const sinceStep = Math.max(0, (now - sample.stepAt) / 1000);
  // Eases toward MAX_CREEP: about two thirds of it after one usual part.
  const creep = MAX_CREEP * (1 - Math.exp(-sinceStep / pace));
  const fraction = (done + creep) / total;
  const secondsLeft =
    sample.done > 0
      ? Math.max(1, Math.round((total - done - creep) * pace))
      : null;
  return { fraction, secondsLeft };
}

/** "0:42", "12:05". */
export const formatElapsed = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
