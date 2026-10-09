import React from "react";
import { formatKeyPart, type OSType } from "@/lib/utils/keyboard";

/** The Mac's own signs for its modifier keys, as its menus print them. */
const MAC_SYMBOLS: Record<string, string> = {
  command: "⌘",
  cmd: "⌘",
  meta: "⌘",
  super: "⌘",
  option: "⌥",
  alt: "⌥",
  control: "⌃",
  ctrl: "⌃",
  shift: "⇧",
};

/** The order the Mac prints modifiers in (⌃⌥⇧⌘), then everything else. */
const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];
const macRank = (part: string) => {
  const symbol = MAC_SYMBOLS[part.trim().split("_")[0].toLowerCase()];
  return symbol ? MAC_ORDER.indexOf(symbol) : MAC_ORDER.length;
};

/** Short names the Mac's menus use for a few keys. */
const MAC_NAMES: Record<string, string> = { escape: "esc", esc: "esc" };

/** One key's label: the Mac's sign for a modifier ("Right ⌥" keeps the side
 * that matters), the formatted name for everything else. */
const keyLabel = (part: string, osType: OSType) => {
  const trimmed = part.trim();
  if (osType === "macos") {
    const [name, side] = trimmed.split("_");
    const symbol = MAC_SYMBOLS[name.toLowerCase()];
    if (symbol) return side === "right" ? `Right ${symbol}` : symbol;
    const short = MAC_NAMES[name.toLowerCase()];
    if (short) return short;
  }
  return formatKeyPart(trimmed);
};

/**
 * A shortcut drawn as a row of keys ("⇧ ⌘ Y") instead of a sentence
 * ("Left Shift + Left Command + Y"), so it stays on one line and reads at a
 * glance. The full words stay available to screen readers and on hover.
 */
export const Keycaps: React.FC<{ combination: string; osType: OSType }> = ({
  combination,
  osType,
}) => {
  const parts = combination.split("+").filter((part) => part.trim());
  if (osType === "macos") parts.sort((a, b) => macRank(a) - macRank(b));
  const spoken = parts.map(formatKeyPart).join(" + ");
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap align-middle"
      title={spoken}
      aria-label={spoken}
    >
      {parts.map((part, index) => (
        <kbd
          key={`${part}-${index}`}
          aria-hidden
          className="min-w-7 h-7 px-2 grid place-items-center rounded-lg border border-hairline bg-background text-[13px] font-medium text-text shadow-[0_1px_0_var(--color-hairline)]"
        >
          {/* The system face draws the Mac's key signs at full size. */}
          <span
            style={{ fontFamily: "-apple-system, system-ui, sans-serif" }}
            className={
              MAC_ORDER.some((sign) => keyLabel(part, osType).includes(sign))
                ? "text-[15px] leading-none"
                : undefined
            }
          >
            {keyLabel(part, osType)}
          </span>
        </kbd>
      ))}
    </span>
  );
};
