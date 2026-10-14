import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  commands,
  events,
  type Enhancement,
  type HistoryEntry,
  type MediaSource,
} from "@/bindings";
import { useSettings } from "../../../hooks/useSettings";
import { openSection } from "@/lib/navigation";
import {
  TRANSLATE_PROMPT_ID,
  TRANSLATE_TARGETS,
  translateTargetName,
} from "@/lib/translateTargets";
import { Button } from "../../ui/Button";
import { Dropdown } from "../../ui/Dropdown";
import { copyToClipboard } from "../history/clipboard";
import { fileErrorKey } from "./fileErrors";
import { CheckIcon, CopyIcon, FolderOpenIcon } from "../../icons/bulk";

/** What the decoder reads (commands/files.rs MEDIA_EXTENSIONS). */
const MEDIA_EXTENSIONS = [
  "mp3",
  "m4a",
  "mp4",
  "mov",
  "m4v",
  "wav",
  "flac",
  "ogg",
  "aac",
];

type Phase = "download" | "read" | "transcribe" | "enhance";
interface Progress {
  phase: Phase;
  done: number;
  total: number;
}

/** An entry made from a file (FilesPage → transcribe_media). */
export const isFileEntry = (entry: HistoryEntry) =>
  entry.file_name.startsWith("file-");

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

// SpeakEase's Files page: a file or a link in, its words out, then rewritten
// or translated on demand (docs/product/ux/files.md).
export const FilesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [jobName, setJobName] = useState("");
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = progress !== null;
  const busyRef = useRef(false);
  busyRef.current = busy;

  const aiOn = settings?.post_process_enabled ?? false;
  const prompts = (settings?.post_process_prompts ?? []).filter(
    (prompt) => prompt.id !== TRANSLATE_PROMPT_ID,
  );

  const loadRecent = useCallback(async () => {
    const result = await commands.getHistoryEntries(null, 100);
    if (result.status === "ok") {
      setRecent(result.data.entries.filter(isFileEntry).slice(0, 6));
    }
  }, []);

  useEffect(() => {
    loadRecent();
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload = event.payload;
      if (payload.action === "updated" || payload.action === "added") {
        setEntry((current) =>
          current && current.id === payload.entry.id ? payload.entry : current,
        );
      }
      if (payload.action === "deleted") {
        setEntry((current) =>
          current && current.id === payload.id ? null : current,
        );
      }
      loadRecent();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadRecent]);

  useEffect(() => {
    const unlisten = listen<Progress>("file-progress", (event) =>
      setProgress((current) => (current ? event.payload : current)),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const failed = useCallback(
    (error: string) => {
      const key = fileErrorKey(error);
      if (key === "cancelled") return;
      if (key === "ai_off") {
        toast.error(t("files.errors.ai_off"), {
          action: {
            label: t("files.openAi"),
            onClick: () => openSection("postprocessing"),
          },
        });
        return;
      }
      toast.error(t(`files.errors.${key}`));
    },
    [t],
  );

  // SE-FILE-002
  const run = useCallback(
    async (source: MediaSource, name: string) => {
      if (busyRef.current) return;
      setJobName(name);
      setProgress({
        phase: source.kind === "url" ? "download" : "read",
        done: 0,
        total: 1,
      });
      const result = await commands.transcribeMedia(source);
      setProgress(null);
      if (result.status === "ok") {
        setEntry(result.data);
        setLink("");
      } else {
        failed(result.error);
      }
    },
    [failed],
  );

  const runPath = useCallback(
    (path: string) => {
      const name = path.split(/[\\/]/).pop() ?? path;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!MEDIA_EXTENSIONS.includes(ext)) {
        toast.error(t("files.errors.unsupported"));
        return;
      }
      run({ kind: "path", value: path }, name);
    },
    [run, t],
  );

  // Files dropped anywhere on the window land here while this page shows.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "over" || payload.type === "enter") {
            setDragging(!busyRef.current);
          } else if (payload.type === "drop") {
            setDragging(false);
            if (payload.paths[0]) runPath(payload.paths[0]);
          } else {
            setDragging(false);
          }
        }),
      )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // No webview (browser preview): the picker still works.
      });
    return () => unlisten?.();
  }, [runPath]);

  const pick = async () => {
    const chosen = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("files.filterName"), extensions: MEDIA_EXTENSIONS }],
    });
    if (typeof chosen === "string") runPath(chosen);
  };

  const submitLink = (event: React.FormEvent) => {
    event.preventDefault();
    const url = link.trim();
    if (!url) return;
    run({ kind: "url", value: url }, url);
  };

  // SE-FILE-003
  const enhance = async (enhancement: Enhancement, name: string) => {
    if (!entry || busyRef.current) return;
    setJobName(name);
    setProgress({ phase: "enhance", done: 0, total: 1 });
    const result = await commands.enhanceHistoryEntry(entry.id, enhancement);
    setProgress(null);
    if (result.status === "ok") setEntry(result.data);
    else failed(result.error);
  };

  const shownText = entry
    ? (entry.post_processed_text ?? entry.transcription_text)
    : "";

  const saveText = async () => {
    if (!entry) return;
    const base = entry.title.replace(/\.[^.]+$/, "") || "speakease";
    const path = await save({
      defaultPath: `${base}.txt`,
      filters: [{ name: t("files.textFile"), extensions: ["txt"] }],
    });
    if (!path) return;
    const result = await commands.writeTextFile(path, shownText);
    if (result.status === "ok") toast.success(t("files.saved"));
    else toast.error(t("files.errors.other"));
  };

  const percent = progress
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : 0;
  const phaseLabel = progress
    ? progress.phase === "transcribe" && progress.total > 1
      ? t("files.phase.transcribeParts", {
          done: progress.done,
          total: progress.total,
        })
      : progress.phase === "enhance" && progress.total > 1
        ? t("files.phase.enhanceParts", {
            done: progress.done,
            total: progress.total,
          })
        : t(`files.phase.${progress.phase}`)
    : "";

  return (
    <div className="max-w-3xl w-full mx-auto space-y-5">
      {busy ? (
        <div
          aria-live="polite"
          className="rounded-2xl border border-hairline bg-surface px-5 py-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium truncate" title={jobName}>
              {jobName}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => commands.cancelFileJob()}
            >
              {t("files.cancel")}
            </Button>
          </div>
          <div className="h-1.5 rounded-full bg-row overflow-hidden">
            <div
              className="h-full bg-logo-primary transition-[width] duration-300"
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
          <p className="text-xs text-mid-gray tabular-nums">
            {phaseLabel} · {percent}%
          </p>
        </div>
      ) : (
        <div
          className={`rounded-2xl border-2 border-dashed px-6 flex flex-col items-center text-center gap-3 transition-colors ${
            // With a result below, the drop area steps back to a short band.
            entry ? "py-4" : "py-8"
          } ${
            dragging
              ? "border-logo-primary bg-logo-primary/10"
              : "border-hairline bg-surface"
          }`}
        >
          {!entry && (
            <FolderOpenIcon width={36} height={36} className="text-mid-gray" />
          )}
          <div className="space-y-1">
            <p className="text-[15px] font-medium">
              {dragging ? t("files.dropNow") : t("files.drop")}
            </p>
            <p className="text-xs text-mid-gray">{t("files.formats")}</p>
          </div>
          <Button variant="primary" size="md" onClick={pick}>
            {t("files.choose")}
          </Button>
          <form
            onSubmit={submitLink}
            className="w-full max-w-lg flex items-center gap-2 pt-2"
          >
            <input
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder={t("files.linkPlaceholder")}
              aria-label={t("files.linkPlaceholder")}
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl bg-row border border-transparent focus:outline-none focus:ring-2 focus:ring-logo-primary/40"
            />
            <Button
              type="submit"
              variant="secondary"
              size="md"
              disabled={!link.trim()}
            >
              {t("files.fromLink")}
            </Button>
          </form>
        </div>
      )}

      {entry && (
        <div className="rounded-2xl border border-hairline bg-surface px-4 pt-3 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" title={entry.title}>
                {entry.title}
              </p>
              <p className="text-xs text-mid-gray tabular-nums">
                {t("files.words", { count: wordCount(shownText) })}
                {entry.post_processed_text ? ` · ${t("files.aiVersion")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (await copyToClipboard(shownText)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="flex items-center gap-1"
              >
                {copied ? (
                  <CheckIcon width={14} height={14} />
                ) : (
                  <CopyIcon width={14} height={14} />
                )}
                {copied ? t("files.copied") : t("files.copy")}
              </Button>
              <Button variant="secondary" size="sm" onClick={saveText}>
                {t("files.saveTxt")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Dropdown
              className="min-w-44"
              placeholder={t("files.rewrite")}
              selectedValue={null}
              disabled={busy || !aiOn || prompts.length === 0}
              options={prompts.map((prompt) => ({
                value: prompt.id,
                label: prompt.name,
              }))}
              onSelect={(id) =>
                enhance(
                  { kind: "prompt", value: id },
                  prompts.find((prompt) => prompt.id === id)?.name ?? id,
                )
              }
            />
            <Dropdown
              className="min-w-44"
              placeholder={t("files.translate")}
              selectedValue={null}
              disabled={busy || !aiOn}
              options={TRANSLATE_TARGETS.map((target) => ({
                value: target.value,
                label: translateTargetName(target.value, i18n.language),
              }))}
              onSelect={(target) =>
                enhance(
                  { kind: "translate", value: target },
                  t("files.translatingInto", {
                    language: translateTargetName(target, i18n.language, true),
                  }),
                )
              }
            />
            {!aiOn && (
              <button
                type="button"
                onClick={() => openSection("postprocessing")}
                className="text-xs text-logo-primary hover:underline cursor-pointer"
              >
                {t("files.turnOnAi")}
              </button>
            )}
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-3">
            <p className="text-[15px] leading-relaxed select-text cursor-text whitespace-pre-wrap break-words">
              {shownText}
            </p>
            {entry.post_processed_text && (
              <div className="rounded-xl bg-row/70 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
                  {t("settings.history.original", { defaultValue: "Original" })}
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-mid-gray select-text whitespace-pre-wrap break-words">
                  {entry.transcription_text}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
            {t("files.recent")}
          </h2>
          <div className="rounded-2xl border border-hairline bg-surface divide-y divide-hairline overflow-hidden">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEntry(item)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-start cursor-pointer transition-colors ${
                  entry?.id === item.id ? "bg-glass-chosen" : "hover:bg-row/60"
                }`}
              >
                <span className="text-sm truncate">{item.title}</span>
                <span className="text-xs text-mid-gray tabular-nums shrink-0">
                  {new Date(item.timestamp * 1000).toLocaleDateString(
                    i18n.language,
                  )}
                  {" · "}
                  {t("files.words", {
                    count: wordCount(
                      item.post_processed_text ?? item.transcription_text,
                    ),
                  })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
