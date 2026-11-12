import React from "react";
import { useTranslation } from "react-i18next";
import { IconTip } from "./IconTip";

/**
 * The parts every list page of entries shares (History, Meetings; owner,
 * 12/11: list pages look alike): one card per entry under a day heading,
 * the entry's time first, its actions as icons at the card's end.
 */

/** One entry's card; padding and content are the page's own. */
export const entryCard =
  "group rounded-2xl border border-hairline bg-surface transition-colors hover:border-mid-gray/40";

/** Loading, empty and no-match, in a card like the entries'. */
export const entryNotice =
  "rounded-2xl border border-hairline bg-surface px-4 py-8 text-center text-sm text-mid-gray";

/** The actions at a card's end: faint at rest, full on hover or focus. */
export const entryActions =
  "flex items-center opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity";

/** Calendar day of an entry (seconds), for grouping. */
export const dayKey = (timestamp: number) =>
  new Date(timestamp * 1000).toDateString();

/** "Today", "Yesterday", or the weekday and date. */
export const DayHeader: React.FC<{ timestamp: number }> = ({ timestamp }) => {
  const { t, i18n } = useTranslation();
  const day = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label =
    day.toDateString() === today.toDateString()
      ? t("settings.history.today", { defaultValue: "Today" })
      : day.toDateString() === yesterday.toDateString()
        ? t("settings.history.yesterday", { defaultValue: "Yesterday" })
        : day.toLocaleDateString(i18n.language, {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
  return (
    <h3 className="px-1 pt-3 first:pt-0 text-xs font-semibold text-mid-gray uppercase tracking-wide">
      {label}
    </h3>
  );
};

/** An entry's action: an icon, named the moment it is reached (IconTip). */
export const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  /** A longer accessible name than the tip, e.g. naming the entry. */
  ariaLabel?: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, ariaLabel, disabled, active, children }) => (
  <IconTip label={title}>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? title}
      className={`p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-text/20 focus-visible:outline-2 focus-visible:outline-logo-primary ${
        active
          ? "text-logo-primary hover:bg-logo-primary/10"
          : "text-text/50 hover:text-text hover:bg-row"
      }`}
    >
      {children}
    </button>
  </IconTip>
);
