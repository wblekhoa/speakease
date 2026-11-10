import React from "react";
import { Mic, Timer, Type, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DayStats, HistoryStats } from "@/bindings";

/** `YYYY-MM-DD` for a date in local time, the form the backend's days use. */
const localIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** A backend `YYYY-MM-DD` as a local date (not UTC midnight). */
const fromIso = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** The counters above the history list: two small cards and the time saved
 * with one bar per day (SE-HIST-002, SE-HIST-004). */
export const HistoryStatsPanel: React.FC<{ stats: HistoryStats }> = ({
  stats,
}) => {
  const { t, i18n } = useTranslation();
  const format = (value: number) => value.toLocaleString(i18n.language);
  const last = stats.days[stats.days.length - 1];
  // Only trust "today" when the backend's last day is still today here.
  const today = last && last.date === localIso(new Date()) ? last : undefined;
  const todayLabel = (value?: number) =>
    value ? t("settings.history.statToday", { value: format(value) }) : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-2">
      <StatCard
        icon={Mic}
        value={format(stats.entries)}
        label={t("settings.history.statEntries")}
        today={todayLabel(today?.entries)}
      />
      <StatCard
        icon={Type}
        value={format(stats.words)}
        label={t("settings.history.statWords")}
        today={todayLabel(today?.words)}
      />
      <div className="flex items-end gap-4 rounded-2xl border border-hairline bg-surface px-4 py-3">
        <div className="shrink-0">
          <IconChip icon={Timer} />
          <p className="font-display text-xl font-semibold tabular-nums">
            {format(stats.minutes_saved)}
          </p>
          <p className="text-xs text-mid-gray">
            {t("settings.history.statMinutes")}
          </p>
        </div>
        <DayBars days={stats.days} />
      </div>
    </div>
  );
};

const IconChip: React.FC<{ icon: LucideIcon }> = ({ icon: Icon }) => (
  <span
    aria-hidden="true"
    className="mb-2 flex size-7 items-center justify-center rounded-lg bg-logo-primary/10 text-logo-primary"
  >
    <Icon size={16} strokeWidth={2} />
  </span>
);

const StatCard: React.FC<{
  icon: LucideIcon;
  value: string;
  label: string;
  today: string;
}> = ({ icon, value, label, today }) => (
  <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
    <IconChip icon={icon} />
    <p className="font-display text-xl font-semibold tabular-nums">{value}</p>
    <p className="text-xs text-mid-gray">
      {label}
      {today && (
        <span className="ms-1 font-medium text-logo-primary tabular-nums">
          · {today}
        </span>
      )}
    </p>
  </div>
);

/** Minutes saved per day, oldest on the left; today is the solid bar. */
const DayBars: React.FC<{ days: DayStats[] }> = ({ days }) => {
  const { t, i18n } = useTranslation();
  if (days.length === 0) return null;
  const most = Math.max(...days.map((day) => day.minutes_saved), 0);
  const label = (day: DayStats) =>
    t("settings.history.chartBar", {
      date: fromIso(day.date).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "numeric",
      }),
      minutes: day.minutes_saved.toLocaleString(i18n.language),
    });

  return (
    <figure className="m-0 flex min-w-0 flex-1 flex-col gap-1">
      <figcaption className="sr-only">
        {t("settings.history.chartLabel", { days: days.length })}
      </figcaption>
      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.date}>{label(day)}</li>
        ))}
      </ul>
      <div aria-hidden="true" className="flex h-12 items-end gap-[3px]">
        {days.map((day, index) => {
          const isToday = index === days.length - 1;
          const share = most > 0 ? day.minutes_saved / most : 0;
          return (
            <div
              key={day.date}
              title={label(day)}
              className={`flex-1 rounded-t-[3px] ${
                day.entries === 0
                  ? "bg-mid-gray/40"
                  : isToday
                    ? "bg-logo-primary"
                    : "bg-logo-primary/60"
              }`}
              style={{ height: `${Math.max(share * 100, 6)}%` }}
            />
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between text-[11px] text-mid-gray"
      >
        <span>
          {fromIso(days[0].date).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "numeric",
          })}
        </span>
        <span>{t("settings.history.today")}</span>
      </div>
    </figure>
  );
};
