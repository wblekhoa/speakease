// SE-AI-013: the last few instructions typed on a History card, newest
// first, kept in this window's storage so they can be run again.

export const MAX_RECENT_INSTRUCTIONS = 5;
const STORAGE_KEY = "speakease.recentInstructions";

/** Puts `text` first, drops an earlier copy (ignoring case and spaces at
 * the ends) and keeps at most `max`. A blank text changes nothing. */
export const rememberInstruction = (
  list: string[],
  text: string,
  max = MAX_RECENT_INSTRUCTIONS,
): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return list;
  const key = trimmed.toLowerCase();
  return [
    trimmed,
    ...list.filter((item) => item.trim().toLowerCase() !== key),
  ].slice(0, max);
};

export const forgetInstruction = (list: string[], text: string): string[] =>
  list.filter((item) => item !== text);

/** Reads the stored list; anything unreadable counts as empty. */
export const parseInstructions = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter(
        (item, at, all) =>
          all.findIndex(
            (other) => other.toLowerCase() === item.toLowerCase(),
          ) === at,
      )
      .slice(0, MAX_RECENT_INSTRUCTIONS);
  } catch {
    return [];
  }
};

export const loadInstructions = (): string[] => {
  try {
    return parseInstructions(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
};

export const saveInstructions = (list: string[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable; the list then lasts until the window closes.
  }
};
