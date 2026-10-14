import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  CheckIcon,
  CopyIcon,
  FolderOpenIcon,
  MagicStarIcon,
  ReadingSettingsIcon,
  RefreshArrowIcon,
  SearchIcon,
  SpeakerIcon,
  StarIcon,
  StarOutlineIcon,
  TrashIcon,
} from "../../icons/bulk";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type HistoryStats,
  type HistoryUpdatePayload,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { useSettings } from "@/hooks/useSettings";
import {
  TRANSLATE_PROMPT_ID,
  TRANSLATE_TARGETS,
  translateTargetName,
} from "@/lib/translateTargets";
import { openSection } from "@/lib/navigation";
import { fileErrorKey } from "../files/fileErrors";
import { AudioPlayer, AudioPlayerGroup } from "../../ui/AudioPlayer";
import { Button } from "../../ui/Button";
import { IconTip } from "../../ui/IconTip";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { HistoryLimit } from "../HistoryLimit";
import { RecordingRetentionPeriodSelector } from "../RecordingRetentionPeriod";
import { copyToClipboard } from "./clipboard";

/** An entry's action: an icon, named the moment it is reached (IconTip). */
const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, children }) => (
  <IconTip label={title}>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
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

const PAGE_SIZE = 30;

/** Calendar day of an entry, for grouping. */
const dayKey = (timestamp: number) => new Date(timestamp * 1000).toDateString();

/** The text the user got: the AI version when there is one. */
const shownText = (entry: HistoryEntry) =>
  entry.post_processed_text?.trim()
    ? entry.post_processed_text
    : entry.transcription_text;

interface OpenRecordingsButtonProps {
  onClick: () => void;
  label: string;
}

const OpenRecordingsButton: React.FC<OpenRecordingsButtonProps> = ({
  onClick,
  label,
}) => (
  <IconTip label={label} align="end">
    <Button
      onClick={onClick}
      variant="secondary"
      size="sm"
      className="h-9 w-9 grid place-items-center !px-0"
      aria-label={label}
    >
      <FolderOpenIcon width={16} height={16} />
    </Button>
  </IconTip>
);

export const HistorySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const loadingRef = useRef(false);
  const [query, setQuery] = useState("");
  // How long history is kept: folded under the header, opened by its button.
  const [keepingOpen, setKeepingOpen] = useState(false);
  const [results, setResults] = useState<HistoryEntry[] | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);

  const loadStats = useCallback(async () => {
    const result = await commands.getHistoryStats();
    if (result.status === "ok") setStats(result.data);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Search runs on the whole history (server side), a beat after typing stops.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await commands.searchHistoryEntries(trimmed);
      if (result.status === "ok") setResults(result.data);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, entries]);

  // Keep ref in sync for use in IntersectionObserver callback
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const loadPage = useCallback(async (cursor?: number) => {
    const isFirstPage = cursor === undefined;
    if (!isFirstPage && loadingRef.current) return;
    loadingRef.current = true;

    if (isFirstPage) setLoading(true);

    try {
      const result = await commands.getHistoryEntries(
        cursor ?? null,
        PAGE_SIZE,
      );
      if (result.status === "ok") {
        const { entries: newEntries, has_more } = result.data;
        setEntries((prev) =>
          isFirstPage ? newEntries : [...prev, ...newEntries],
        );
        setHasMore(has_more);
      }
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (first.isIntersecting) {
          const lastEntry = entriesRef.current[entriesRef.current.length - 1];
          if (lastEntry) {
            loadPage(lastEntry.id);
          }
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadPage]);

  // Listen for new entries added from the transcription pipeline
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      loadStats();
      if (payload.action === "added") {
        setEntries((prev) => [payload.entry, ...prev]);
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
      // "deleted" and "toggled" are handled by optimistic updates only,
      // so we intentionally ignore them here to avoid double-mutation.
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadStats]);

  const toggleSaved = async (id: number) => {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
    );
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        // Revert on failure
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    }
  };

  const getAudioUrl = useCallback(
    async (fileName: string) => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status === "ok") {
          if (osType === "linux") {
            const fileData = await readFile(result.data);
            const blob = new Blob([fileData], { type: "audio/wav" });
            return URL.createObjectURL(blob);
          }
          return convertFileSrc(result.data, "asset");
        }
        return null;
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const deleteAudioEntry = async (id: number) => {
    // Optimistically remove
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setResults((prev) => prev && prev.filter((e) => e.id !== id));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        // Reload on failure
        loadPage();
      }
    } catch (error) {
      console.error("Failed to delete entry:", error);
      loadPage();
    }
  };

  const retryHistoryEntry = async (id: number) => {
    const result = await commands.retryHistoryEntryTranscription(id);
    if (result.status !== "ok") {
      throw new Error(String(result.error));
    }
  };

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  const { settings } = useSettings();
  /** The name of the AI prompt an entry went through, if any. */
  const promptNameFor = (entry: HistoryEntry) =>
    entry.post_processed_text?.trim()
      ? (settings?.post_process_prompts?.find(
          (prompt) => prompt.prompt === entry.post_process_prompt,
        )?.name ??
        // The Speak page's translations through English keep their second
        // leg's prompt, which is generated, not stored (settings.rs).
        (entry.post_process_prompt?.startsWith(
          "<transcript>\n${output}\n</transcript>\n\nThe text above is English. Translate",
        )
          ? t("settings.history.translatedBadge", {
              defaultValue: "Translated",
            })
          : t("settings.history.aiBadge", { defaultValue: "AI" })))
      : null;

  let content: React.ReactNode;
  const shown = results ?? entries;

  if (loading) {
    content = (
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-8 text-center text-sm text-mid-gray">
        {t("settings.history.loading")}
      </div>
    );
  } else if (shown.length === 0) {
    content = (
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-8 text-center text-sm text-mid-gray">
        {results
          ? t("settings.history.noResults", { defaultValue: "No matches" })
          : t("settings.history.empty")}
      </div>
    );
  } else {
    content = (
      <>
        <AudioPlayerGroup>
          <div className="flex flex-col gap-2">
            {shown.map((entry, index) => (
              <React.Fragment key={entry.id}>
                {(index === 0 ||
                  dayKey(shown[index - 1].timestamp) !==
                    dayKey(entry.timestamp)) && (
                  <DayHeader timestamp={entry.timestamp} />
                )}
                <HistoryEntryComponent
                  entry={entry}
                  promptName={promptNameFor(entry)}
                  onToggleSaved={() => toggleSaved(entry.id)}
                  onCopyText={() => copyToClipboard(shownText(entry))}
                  getAudioUrl={getAudioUrl}
                  deleteAudio={deleteAudioEntry}
                  retryTranscription={retryHistoryEntry}
                />
              </React.Fragment>
            ))}
          </div>
        </AudioPlayerGroup>
        {/* Sentinel for infinite scroll */}
        {!results && <div ref={sentinelRef} className="h-1" />}
      </>
    );
  }

  // The page's name is in the window toolbar (App.tsx), so the page opens on
  // its tools: search, how long history is kept, the recordings folder.
  return (
    <div className="max-w-3xl w-full mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2 h-9 px-3 rounded-xl border border-hairline bg-surface focus-within:border-logo-primary">
          <SearchIcon width={16} height={16} className="text-mid-gray" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("settings.history.searchPlaceholder", {
              defaultValue: "Search what you said",
            })}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <Button
          onClick={() => setKeepingOpen((open) => !open)}
          variant="secondary"
          size="sm"
          className={`h-9 flex items-center gap-2 ${keepingOpen ? "border-logo-primary text-logo-primary" : ""}`}
          aria-expanded={keepingOpen}
        >
          <ReadingSettingsIcon width={16} height={16} />
          <span>{t("settings.history.keeping")}</span>
        </Button>
        <OpenRecordingsButton
          onClick={openRecordingsFolder}
          label={t("settings.history.openFolder")}
        />
      </div>

      {keepingOpen && (
        <SettingsGroup>
          <HistoryLimit descriptionMode="tooltip" grouped />
          <RecordingRetentionPeriodSelector descriptionMode="tooltip" grouped />
        </SettingsGroup>
      )}

      {stats && stats.entries > 0 && !results && (
        <dl className="grid grid-cols-3 gap-2">
          {[
            [stats.entries, t("settings.history.statEntries")],
            [stats.words, t("settings.history.statWords")],
            [stats.minutes_saved, t("settings.history.statMinutes")],
          ].map(([value, label]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-hairline bg-surface px-4 py-3"
            >
              <dd className="font-display text-xl font-semibold tabular-nums">
                {Number(value).toLocaleString(i18n.language)}
              </dd>
              <dt className="text-xs text-mid-gray">{label}</dt>
            </div>
          ))}
        </dl>
      )}

      {content}
    </div>
  );
};

const DayHeader: React.FC<{ timestamp: number }> = ({ timestamp }) => {
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

interface HistoryEntryProps {
  entry: HistoryEntry;
  promptName: string | null;
  onToggleSaved: () => void;
  onCopyText: () => Promise<boolean>;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
  retryTranscription: (id: number) => Promise<void>;
}

const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  promptName,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
  retryTranscription,
}) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [listening, setListening] = useState(false);
  // A file's transcript can run to thousands of words: folded to a few
  // lines until asked for (SE-FILE-002).
  const fromFile = entry.file_name.startsWith("file-");
  const [expanded, setExpanded] = useState(false);
  const folded = fromFile && !expanded;
  // Rewrite or translate any entry after the fact (SE-FILE-003).
  const { settings } = useSettings();
  const [aiMenu, setAiMenu] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  const aiOn = settings?.post_process_enabled ?? false;
  const prompts = (settings?.post_process_prompts ?? []).filter(
    (prompt) => prompt.id !== TRANSLATE_PROMPT_ID,
  );
  const runAi = async (enhancement: {
    kind: "prompt" | "translate";
    value: string;
  }) => {
    setAiMenu(false);
    setAiWorking(true);
    const result = await commands.enhanceHistoryEntry(entry.id, enhancement);
    setAiWorking(false);
    if (result.status === "error") {
      const key = fileErrorKey(result.error);
      if (key !== "cancelled") toast.error(t(`files.errors.${key}`));
    }
  };

  const hasTranscription = entry.transcription_text.trim().length > 0;
  const aiText = entry.post_processed_text?.trim()
    ? entry.post_processed_text
    : null;

  const handleLoadAudio = useCallback(
    () => getAudioUrl(entry.file_name),
    [getAudioUrl, entry.file_name],
  );

  const handleCopyText = async () => {
    if (!hasTranscription) {
      return;
    }

    const copied = await onCopyText();
    if (!copied) {
      toast.error(t("settings.history.copyError"));
      return;
    }

    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
    }
  };

  const handleRetranscribe = async () => {
    try {
      setRetrying(true);
      await retryTranscription(entry.id);
    } catch (error) {
      console.error("Failed to re-transcribe:", error);
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const time = new Date(entry.timestamp * 1000).toLocaleTimeString(
    i18n.language,
    { hour: "2-digit", minute: "2-digit" },
  );

  // SE-HIST-003
  const endsOnOriginal =
    Boolean(aiText) &&
    !retrying &&
    !listening &&
    !fromFile &&
    !aiMenu &&
    !aiWorking;

  return (
    // One card per dictation: when, what it became, and what was said.
    <div
      className={`group rounded-2xl border border-hairline bg-surface px-4 pt-3 flex flex-col gap-2 transition-colors hover:border-mid-gray/40 ${
        // A card that ends on the inset "original" box keeps the same 16px
        // around that box below as beside it; text ends on the usual 12px.
        endsOnOriginal ? "pb-4" : "pb-3"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-mid-gray tabular-nums">{time}</span>
        {fromFile && (
          <span
            className="min-w-0 flex items-center gap-1 text-xs text-mid-gray"
            title={entry.title}
          >
            <FolderOpenIcon width={14} height={14} className="shrink-0" />
            <span className="truncate max-w-56">{entry.title}</span>
          </span>
        )}
        {promptName && (
          <span className="text-[11px] leading-5 px-2 rounded-full bg-logo-primary/15 text-logo-primary">
            {promptName}
          </span>
        )}
        <div className="ml-auto flex items-center opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <IconButton
            onClick={() => setListening((open) => !open)}
            active={listening}
            title={t("settings.history.listen", { defaultValue: "Play back" })}
          >
            <SpeakerIcon width={18} height={18} />
          </IconButton>
          <IconButton
            onClick={handleCopyText}
            disabled={!hasTranscription || retrying}
            title={t("settings.history.copyToClipboard")}
          >
            {showCopied ? (
              <CheckIcon width={18} height={18} />
            ) : (
              <CopyIcon width={18} height={18} />
            )}
          </IconButton>
          <IconButton
            onClick={onToggleSaved}
            disabled={retrying}
            active={entry.saved}
            title={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
          >
            {entry.saved ? (
              <StarIcon width={18} height={18} />
            ) : (
              <StarOutlineIcon width={18} height={18} />
            )}
          </IconButton>
          <IconButton
            onClick={() => setAiMenu((open) => !open)}
            disabled={!hasTranscription || retrying || aiWorking}
            active={aiMenu}
            title={t("settings.history.aiMenu")}
          >
            <MagicStarIcon width={18} height={18} />
          </IconButton>
          <IconButton
            onClick={handleRetranscribe}
            disabled={retrying}
            title={t("settings.history.retranscribe")}
          >
            <span
              className="inline-flex"
              style={
                retrying
                  ? { animation: "spin 1s linear infinite reverse" }
                  : undefined
              }
            >
              <RefreshArrowIcon width={18} height={18} />
            </span>
          </IconButton>
          <IconButton
            onClick={handleDeleteEntry}
            disabled={retrying}
            title={t("settings.history.delete")}
          >
            <TrashIcon width={18} height={18} />
          </IconButton>
        </div>
      </div>

      <p
        className={`text-sm ${
          retrying
            ? ""
            : hasTranscription
              ? `text-[15px] leading-relaxed text-text select-text cursor-text whitespace-pre-wrap break-words ${
                  folded ? "line-clamp-6" : ""
                }`
              : "text-text/40"
        }`}
        style={
          retrying
            ? { animation: "transcribe-pulse 3s ease-in-out infinite" }
            : undefined
        }
      >
        {retrying && (
          <style>{`
            @keyframes transcribe-pulse {
              0%, 100% { color: color-mix(in srgb, var(--color-text) 40%, transparent); }
              50% { color: color-mix(in srgb, var(--color-text) 90%, transparent); }
            }
          `}</style>
        )}
        {retrying
          ? t("settings.history.transcribing")
          : hasTranscription
            ? (aiText ?? entry.transcription_text)
            : t("settings.history.transcriptionFailed")}
      </p>
      {aiText && !retrying && (
        <div className="rounded-xl bg-row/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
            {t("settings.history.original", { defaultValue: "Original" })}
          </p>
          <p
            className={`mt-0.5 text-[13px] leading-snug text-mid-gray select-text whitespace-pre-wrap break-words ${
              folded ? "line-clamp-3" : ""
            }`}
          >
            {entry.transcription_text}
          </p>
        </div>
      )}

      {aiWorking && (
        <p className="text-xs text-mid-gray animate-pulse">
          {t("files.phase.enhance")}…
        </p>
      )}

      {aiMenu && (
        <div className="rounded-xl border border-hairline px-3 py-2.5 space-y-2">
          {aiOn ? (
            <>
              {prompts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-mid-gray me-1">
                    {t("settings.history.rewriteWith")}
                  </span>
                  {prompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      onClick={() =>
                        runAi({ kind: "prompt", value: prompt.id })
                      }
                      className="text-xs px-2.5 py-1 rounded-full bg-row hover:bg-logo-primary/15 hover:text-logo-primary cursor-pointer transition-colors"
                    >
                      {prompt.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-mid-gray me-1">
                  {t("settings.history.translateInto")}
                </span>
                {TRANSLATE_TARGETS.map((target) => (
                  <button
                    key={target.value}
                    type="button"
                    onClick={() =>
                      runAi({ kind: "translate", value: target.value })
                    }
                    className="text-xs px-2.5 py-1 rounded-full bg-row hover:bg-logo-primary/15 hover:text-logo-primary cursor-pointer transition-colors"
                  >
                    {translateTargetName(target.value, i18n.language)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openSection("postprocessing")}
              className="text-xs text-logo-primary hover:underline cursor-pointer"
            >
              {t("files.turnOnAi")}
            </button>
          )}
        </div>
      )}

      {fromFile && hasTranscription && !retrying && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="self-start text-xs font-medium text-logo-primary hover:underline cursor-pointer"
        >
          {expanded
            ? t("settings.history.showLess")
            : t("settings.history.showAll")}
        </button>
      )}

      {listening && (
        <AudioPlayer onLoadRequest={handleLoadAudio} className="w-full pt-1" />
      )}
    </div>
  );
};
