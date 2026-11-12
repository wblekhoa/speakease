import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { commands, type MeetingEntry } from "@/bindings";
import {
  copyText,
  duration,
  exportMeeting,
  filterOrigins,
  matchesSearch,
  meetingFileName,
  meetingOrigin,
  NOTE_KINDS,
  notesView,
  originKey,
  shownNotes,
  summaryLine,
  type MeetingOrigin,
} from "@/lib/meeting";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Dropdown } from "../../ui/Dropdown";
import { selectMenu, selectOption } from "../../ui/selectStyles";
import { SearchIcon, TrashIcon } from "../../icons/bulk";
import { MarkdownContent } from "../../whats-new/MarkdownContent";
import { copyToClipboard } from "../history/clipboard";
import { MeetingAsk, type Exchange } from "./MeetingAsk";
import { MeetingStart } from "./MeetingStart";

/** Events that change the list (meeting.rs NOTES_EVENT and STATE_EVENT). */
const NOTES_EVENT = "meeting-notes-updated";
const STATE_EVENT = "meeting-state";
/** A template switch could not write new notes (meeting.rs REWRITE_FAILED_EVENT). */
const REWRITE_FAILED_EVENT = "meeting-notes-rewrite-failed";

type Tab = "notes" | "transcript" | "ask";
/** Questions asked per meeting, kept while the app runs: the page itself
 *  unmounts when the user opens another one (SE-MEET-014). */
let askedSoFar: Record<number, Exchange[]> = {};
/** Lines an answer used, and the one the user clicked. */
type Cited = { lines: number[]; line: number };

/** dd/mm HH:MM, as in the meeting's History title (meeting.rs). */
const startedAt = (seconds: number) => {
  const at = new Date(seconds * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(at.getDate())}/${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
};

// SE-MEET-018, SE-MEET-024
/** Meetings (beta), in two steps (owner, 12/11): the list of meetings with
 *  the record bar at the bottom; a click opens one meeting with its tools. */
export const MeetingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<MeetingEntry[] | null>(null);
  // The list could not be read: said inline instead of an empty page.
  const [loadFailed, setLoadFailed] = useState(false);
  // The meeting open in the detail view; null is the list.
  const [chosen, setChosen] = useState<number | null>(null);
  // The last one opened, focused again when Back returns to the list.
  const [lastOpened, setLastOpened] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
  // Kept here, so Back finds the list as it was left.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState<MeetingEntry | null>(null);
  // Questions asked per meeting, kept while the app runs (SE-MEET-014).
  const [chats, setChats] = useState(askedSoFar);
  // A new object per click, so the same line scrolls into view again.
  const [cited, setCited] = useState<Cited>({ lines: [], line: 0 });

  const refresh = useCallback(() => {
    const failed = () => setLoadFailed(true);
    commands.listMeetings().then((result) => {
      if (result.status !== "ok") return failed();
      setLoadFailed(false);
      setMeetings(result.data);
    }, failed);
  }, []);

  useEffect(() => {
    refresh();
    const notes = listen(NOTES_EVENT, refresh);
    const state = listen(STATE_EVENT, refresh);
    const failed = listen(REWRITE_FAILED_EVENT, () =>
      toast.error(t("meeting.page.rewriteFailed")),
    );
    return () => {
      notes.then((stop) => stop());
      state.then((stop) => stop());
      failed.then((stop) => stop());
    };
  }, [refresh, t]);

  const list = meetings ?? [];
  // A meeting that is gone (deleted) shows the list again.
  const entry = list.find((m) => m.meeting.history_id === chosen);

  const open = (id: number) => {
    setChosen(id);
    setLastOpened(id);
    setTab("notes");
    setCited({ lines: [], line: 0 });
  };

  // Deleting removes the History entry, its audio and its meetings row
  // (HistoryManager::delete_entry); there is no undo, so it asks first.
  const confirmDelete = async () => {
    if (!deleting) return;
    const id = deleting.meeting.history_id;
    setDeleting(null);
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") throw new Error(result.error);
      const { [id]: _gone, ...rest } = askedSoFar;
      askedSoFar = rest;
      setChats(askedSoFar);
    } catch {
      toast.error(t("meeting.page.delete.failed"));
    } finally {
      refresh();
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto flex flex-1 flex-col gap-4">
      {entry ? (
        <MeetingDetail
          key={entry.meeting.history_id}
          entry={entry}
          tab={tab}
          onTab={setTab}
          cited={cited}
          onBack={() => setChosen(null)}
          ask={
            <MeetingAsk
              historyId={entry.meeting.history_id}
              transcript={entry.transcript}
              exchanges={chats[entry.meeting.history_id] ?? []}
              onExchanges={(update) => {
                // Written here, not in a state updater: an answer that
                // arrives after the page closed must still be kept.
                const id = entry.meeting.history_id;
                askedSoFar = {
                  ...askedSoFar,
                  [id]: update(askedSoFar[id] ?? []),
                };
                setChats(askedSoFar);
              }}
              onShowLines={(lines, line) => {
                setCited({ lines, line });
                setTab("transcript");
              }}
            />
          }
        />
      ) : (
        <MeetingList
          meetings={meetings}
          loadFailed={loadFailed}
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          onOpen={open}
          onDelete={setDeleting}
          returnTo={lastOpened}
        />
      )}

      {/* The record bar, fixed at the bottom of the list like the Speak and
          Live subtitles pages (owner, 12/11). Hidden, not unmounted, in the
          detail view, so the source choice and an error survive a visit;
          the meeting bar, the shortcut and the tray still stop a meeting
          from there. */}
      <div
        className={`sticky bottom-0 z-10 mt-auto -mx-4 -mb-4 justify-center bg-gradient-to-t from-background from-40% to-transparent px-4 pb-4 pt-8 ${
          entry ? "hidden" : "flex"
        }`}
      >
        <MeetingStart />
      </div>

      <Dialog
        open={deleting !== null}
        title={t("meeting.page.delete.title")}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null);
        }}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t("meeting.page.delete.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t("meeting.page.delete.confirm")}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {t("meeting.page.delete.body", { title: deleting?.title ?? "" })}
        </p>
      </Dialog>
    </div>
  );
};

/** A row's first line: the app, the microphone label, or a file's title. */
const originLabel = (
  origin: MeetingOrigin,
  title: string,
  microphone: string,
): string =>
  origin.kind === "app"
    ? origin.name
    : origin.kind === "microphone"
      ? microphone
      : title;

// SE-MEET-024
const MeetingList: React.FC<{
  meetings: MeetingEntry[] | null;
  loadFailed: boolean;
  query: string;
  onQuery: (query: string) => void;
  filter: string;
  onFilter: (filter: string) => void;
  onOpen: (id: number) => void;
  onDelete: (entry: MeetingEntry) => void;
  /** The meeting Back came from, focused again. */
  returnTo: number | null;
}> = ({
  meetings,
  loadFailed,
  query,
  onQuery,
  filter,
  onFilter,
  onOpen,
  onDelete,
  returnTo,
}) => {
  const { t } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);

  // Only when the list first shows after Back, not on every refresh.
  const backFrom = useRef(returnTo);
  useEffect(() => {
    if (backFrom.current === null) return;
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-meeting="${backFrom.current}"]`)
      ?.focus();
  }, []);

  if (meetings === null) {
    return loadFailed ? (
      <p className="text-sm text-error" role="alert">
        {t("meeting.page.loadFailed")}
      </p>
    ) : null;
  }
  if (meetings.length === 0) {
    return (
      <p className="rounded-2xl border border-hairline bg-surface px-5 py-4 text-sm">
        {t("meeting.page.empty")}
      </p>
    );
  }

  const microphone = t("meeting.start.microphoneLabel");
  const origins = filterOrigins(meetings);
  // A filter whose last meeting was deleted shows them all.
  const shownFilter = origins.some((o) => originKey(o) === filter)
    ? filter
    : "all";
  const shown = meetings.filter(
    (m) =>
      (shownFilter === "all" ||
        originKey(meetingOrigin(m.meeting.app_name, m.title)) ===
          shownFilter) &&
      matchesSearch(m, query),
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-hairline bg-surface px-3 focus-within:border-logo-primary">
          <SearchIcon width={16} height={16} className="text-mid-gray" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={t("meeting.page.search")}
            aria-label={t("meeting.page.search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {origins.length > 1 && (
          <div
            className="flex-none"
            role="group"
            aria-label={t("meeting.page.filter.label")}
          >
            <Dropdown
              options={[
                { value: "all", label: t("meeting.page.filter.all") },
                ...origins.map((o) => ({
                  value: originKey(o),
                  label:
                    o.kind === "file"
                      ? t("meeting.page.filter.file")
                      : originLabel(o, "", microphone),
                })),
              ]}
              selectedValue={shownFilter}
              onSelect={onFilter}
            />
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 text-sm text-mid-gray" role="status">
          {t("meeting.page.noMatch")}
        </p>
      ) : (
        <ul
          ref={listRef}
          className="space-y-1"
          aria-label={t("sidebar.meetings")}
        >
          {shown.map((m) => {
            const { meeting } = m;
            const label = originLabel(
              meetingOrigin(meeting.app_name, m.title),
              m.title,
              microphone,
            );
            const summary = summaryLine(
              notesView(meeting.notes_state, meeting.notes !== null),
              meeting.notes,
              m.transcript,
            );
            return (
              <li
                key={meeting.history_id}
                className="group flex items-center rounded-2xl transition-colors hover:bg-glass-hover focus-within:bg-glass-hover"
              >
                <button
                  type="button"
                  data-meeting={meeting.history_id}
                  onClick={() => onOpen(meeting.history_id)}
                  className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-start cursor-pointer focus-visible:outline-2 focus-visible:outline-logo-primary"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {label}
                    </span>
                    <span className="ms-auto shrink-0 whitespace-nowrap text-sm text-mid-gray tabular-nums">
                      {startedAt(meeting.started_at)} ·{" "}
                      {duration(meeting.duration_ms)}
                    </span>
                  </span>
                  {summary !== "" && (
                    <span className="mt-1 block truncate text-sm text-mid-gray">
                      {summary ?? t("meeting.page.writing")}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t("meeting.page.delete.button", {
                    title: m.title,
                  })}
                  title={t("common.delete")}
                  onClick={() => onDelete(m)}
                  className="me-2 shrink-0 rounded-full p-2 text-mid-gray opacity-0 transition-opacity cursor-pointer hover:bg-row hover:text-error group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-logo-primary"
                >
                  <TrashIcon width={16} height={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

/** Copy and save, in one menu beside the title (owner, 12/11). */
const MoreMenu: React.FC<{
  label: string;
  items: { id: string; label: string; run: () => void }[];
}> = ({ label, items }) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Closed by a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // Into the menu once it opens.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const rows = Array.from(
        menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      );
      event.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      rows[(at + step + rows.length) % rows.length]?.focus();
    }
  };

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-2 text-mid-gray cursor-pointer hover:bg-row hover:text-text focus-visible:outline-2 focus-visible:outline-logo-primary"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          className={`${selectMenu} end-0 w-44`}
          onKeyDown={onKey}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                item.run();
              }}
              className={`${selectOption} focus-visible:outline-2 focus-visible:outline-logo-primary`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MeetingDetail: React.FC<{
  entry: MeetingEntry;
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** Transcript lines an answer used, marked on the transcript tab. */
  cited: Cited;
  onBack: () => void;
  /** The Ask tab's content (SE-MEET-014). */
  ask: React.ReactNode;
}> = ({ entry, tab, onTab, cited, onBack, ask }) => {
  const { t } = useTranslation();
  const { meeting } = entry;
  const view = notesView(meeting.notes_state, meeting.notes !== null);
  const writing = view.kind === "writing";
  const back = useRef<HTMLButtonElement>(null);

  // Opening a meeting moves focus into it, at Back.
  useEffect(() => back.current?.focus(), []);

  const file = {
    title: entry.title,
    notes: shownNotes(view, meeting.notes),
    transcript: entry.transcript,
  };

  // The Ask tab copies the notes, as the Notes tab does.
  const copy = async () => {
    const text = copyText(
      tab === "transcript" ? "transcript" : "notes",
      file.notes,
      entry.transcript,
    );
    if (await copyToClipboard(text)) toast.success(t("meeting.page.copied"));
  };

  // SE-MEET-015
  const saveAs = async (format: "md" | "txt") => {
    const path = await save({
      defaultPath: meetingFileName(entry.title, format),
      filters: [
        {
          name: t(
            format === "md"
              ? "meeting.page.markdownFile"
              : "meeting.page.textFile",
          ),
          extensions: [format],
        },
      ],
    });
    if (!path) return;
    const result = await commands.writeTextFile(
      path,
      exportMeeting(file, format, t("meeting.page.transcriptTab")),
    );
    if (result.status === "ok") toast.success(t("meeting.page.saved"));
    else toast.error(t("meeting.page.saveFailed"));
  };

  // SE-MEET-010
  const rewrite = async (kind: string) => {
    const result = await commands.rewriteMeetingNotes(meeting.history_id, kind);
    if (result.status !== "ok") toast.error(t("meeting.page.rewriteFailed"));
  };

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      aria-pressed={tab === value}
      onClick={() => onTab(value)}
      className={`whitespace-nowrap rounded-xl px-3 py-1 text-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-logo-primary ${
        tab === value ? "bg-glass-chosen font-medium" : "hover:bg-glass-hover"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex items-center gap-1">
        <button
          ref={back}
          type="button"
          aria-label={t("meeting.page.back")}
          title={t("meeting.page.back")}
          onClick={onBack}
          className="-ms-2 shrink-0 rounded-full p-2 cursor-pointer hover:bg-row focus-visible:outline-2 focus-visible:outline-logo-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2 className="me-auto min-w-0 truncate text-base font-semibold">
          {entry.title}
        </h2>
        <MoreMenu
          label={t("meeting.page.more")}
          items={[
            { id: "copy", label: t("meeting.page.copy"), run: copy },
            {
              id: "md",
              label: t("meeting.page.saveMd"),
              run: () => saveAs("md"),
            },
            {
              id: "txt",
              label: t("meeting.page.saveTxt"),
              run: () => saveAs("txt"),
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="me-auto flex gap-1"
          role="group"
          aria-label={t("meeting.page.view")}
        >
          {tabButton("notes", t("meeting.page.notesTab"))}
          {tabButton("transcript", t("meeting.page.transcriptTab"))}
          {tabButton("ask", t("meeting.page.askTab"))}
        </div>
        {/* The template the notes are written with, on the Notes tab only;
            choosing one rewrites them (SE-MEET-010). With no template yet,
            the menu's placeholder names it. A meeting stored with no AI can
            be written once AI is there. */}
        {tab === "notes" && (
          <>
            {meeting.kind && (
              <span className="text-sm text-mid-gray">
                {t("meeting.page.template")}
              </span>
            )}
            <Dropdown
              className="flex-none"
              options={NOTE_KINDS.map((kind) => ({
                value: kind,
                label: t(`meeting.page.kinds.${kind}`),
              }))}
              selectedValue={meeting.kind}
              placeholder={t("meeting.page.template")}
              onSelect={rewrite}
              disabled={writing}
            />
          </>
        )}
      </div>

      {tab === "ask" ? (
        ask
      ) : tab === "transcript" ? (
        <TranscriptLines transcript={entry.transcript} cited={cited} />
      ) : (
        <div className="space-y-3 rounded-2xl border border-hairline bg-surface px-5 py-4">
          {view.kind === "writing" && (
            <p className="text-sm">{t("meeting.page.writing")}</p>
          )}
          {(view.kind === "notes" || (writing && file.notes)) && (
            <>
              {/* Every engine measured made 1-3 name or number errors an
                  hour: the notes are AI output to check (SE-MEET fixed). */}
              <p className="text-sm text-mid-gray">
                {t("meeting.page.check")}{" "}
                <button
                  type="button"
                  onClick={() => onTab("transcript")}
                  className="rounded underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-logo-primary"
                >
                  {t("meeting.page.openTranscript")}
                </button>
              </p>
              <MarkdownContent markdown={file.notes ?? ""} />
            </>
          )}
          {view.kind === "empty" && <p className="text-sm">{meeting.notes}</p>}
          {view.kind === "failed" && (
            <p className="border-b border-dotted border-hairline pb-3 text-sm font-medium">
              {t("meeting.page.failed")}
            </p>
          )}
          {/* SE-MEET-012: with no AI, the user is told why. */}
          {view.kind === "noAi" && (
            <p className="border-b border-dotted border-hairline pb-3 text-sm font-medium">
              {t(`meeting.page.noAi.${view.reason}`)}
            </p>
          )}
          {/* The transcript stays while notes are written for a meeting
              that has none yet. */}
          {(view.kind === "failed" ||
            view.kind === "noAi" ||
            (writing && !file.notes)) && (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {entry.transcript}
            </pre>
          )}
        </div>
      )}
    </section>
  );
};

/** The transcript line by line; an answer's lines are marked and the one
 *  clicked is scrolled into view (SE-MEET-014). */
const TranscriptLines: React.FC<{ transcript: string; cited: Cited }> = ({
  transcript,
  cited,
}) => {
  const clicked = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    clicked.current?.scrollIntoView({ block: "center" });
  }, [cited]);
  return (
    <div className="rounded-2xl border border-hairline bg-surface px-5 py-4 text-sm leading-relaxed">
      {transcript.split("\n").map((line, i) => {
        const marked = cited.lines.includes(i + 1);
        return (
          <p
            key={i}
            ref={cited.line === i + 1 ? clicked : undefined}
            aria-current={marked ? "true" : undefined}
            className={`min-h-[1lh] whitespace-pre-wrap rounded-lg ${
              marked ? "-mx-2 bg-glass-chosen px-2" : ""
            }`}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
};
