import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { commands, type MeetingEntry } from "@/bindings";
import {
  copyText,
  duration,
  exportMeeting,
  meetingFileName,
  NOTE_KINDS,
  notesView,
  shownNotes,
} from "@/lib/meeting";
import { Button } from "../../ui/Button";
import { Dropdown } from "../../ui/Dropdown";
import { MarkdownContent } from "../../whats-new/MarkdownContent";
import { copyToClipboard } from "../history/clipboard";
import { MeetingAsk, type Exchange } from "./MeetingAsk";
import { MeetingStart } from "./MeetingStart";

/** Events that change the list (meeting.rs NOTES_EVENT and STATE_EVENT). */
const NOTES_EVENT = "meeting-notes-updated";
const STATE_EVENT = "meeting-state";
/** A template switch could not write new notes (meeting.rs REWRITE_FAILED_EVENT). */
const REWRITE_FAILED_EVENT = "meeting-notes-rewrite-failed";

type Tab = "notes" | "transcript";
/** Questions asked per meeting, kept while the app runs: the page itself
 *  unmounts when the user opens another one (SE-MEET-014). */
let askedSoFar: Record<number, Exchange[]> = {};
/** Lines an answer used, and the one the user clicked. */
type Cited = { lines: number[]; line: number };

// SE-MEET-018
/** Meetings (beta): the list on the left, the chosen meeting on the right -
 *  its notes, checked against the transcript one click away. */
export const MeetingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<MeetingEntry[] | null>(null);
  // The list could not be read: said inline instead of an empty page.
  const [loadFailed, setLoadFailed] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
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
      setChosen(
        (current) => current ?? result.data[0]?.meeting.history_id ?? null,
      );
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

  // Null until the list arrives, and for good when it cannot be read: the
  // Start control shows either way (SE-MEET-021); the list area then says
  // the list could not be read (loadFailed).
  const list = meetings ?? [];
  // Undefined while there are no meetings yet: the Start control then stands
  // alone beside the empty text, which points to it (SE-MEET-021). The
  // control is mounted in one place, so its source choice survives the first
  // meeting landing in the list.
  const entry: MeetingEntry | undefined =
    list.find((m) => m.meeting.history_id === chosen) ?? list[0];
  // dd/mm HH:MM, as in the meeting's History title (meeting.rs).
  const startedAt = (seconds: number) => {
    const at = new Date(seconds * 1000);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${two(at.getDate())}/${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
  };

  return (
    // The window opens at 780 px: the columns stack until the page is wide
    // enough for them (container queries, as the side column may fold).
    <div className="@container w-full mx-auto min-h-0">
      <div className="flex flex-col gap-4 @2xl:flex-row">
        <div className="flex w-full flex-none flex-col gap-3 @2xl:w-56">
          <MeetingStart />
          <ul
            className="max-h-48 w-full space-y-1 overflow-y-auto @2xl:max-h-none @2xl:overflow-visible"
            aria-label={t("sidebar.meetings")}
            hidden={list.length === 0}
          >
            {list.map((m) => {
              const active = m.meeting.history_id === entry?.meeting.history_id;
              return (
                <li key={m.meeting.history_id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setChosen(m.meeting.history_id);
                      setTab("notes");
                      setCited({ lines: [], line: 0 });
                    }}
                    className={`w-full rounded-xl px-3 py-2 text-start transition-colors focus-visible:outline-2 focus-visible:outline-logo-primary ${
                      active ? "bg-glass-chosen" : "hover:bg-glass-hover"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">
                      {/* SE-MEET-020/021: a microphone-only meeting stores no
                        app; the label stands in its place, so the date shows
                        once (its title carries it too). */}
                      {m.meeting.app_name || t("meeting.start.microphoneLabel")}
                    </span>
                    <span className="block whitespace-nowrap text-sm text-mid-gray tabular-nums">
                      {startedAt(m.meeting.started_at)} ·{" "}
                      {duration(m.meeting.duration_ms)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {entry ? (
          <div className="flex min-w-0 flex-1 flex-col gap-6 @5xl:flex-row @5xl:gap-4">
            <MeetingDetail
              key={entry.meeting.history_id}
              entry={entry}
              tab={tab}
              onTab={setTab}
              cited={cited}
            />
            <MeetingAsk
              key={`ask-${entry.meeting.history_id}`}
              historyId={entry.meeting.history_id}
              transcript={entry.transcript}
              exchanges={chats[entry.meeting.history_id] ?? []}
              onExchanges={(update) => {
                // Written here, not in a state updater: an answer that arrives
                // after the page closed must still be kept.
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
          </div>
        ) : loadFailed && meetings === null ? (
          <p
            className="min-w-0 flex-1 self-start text-xs text-error"
            role="alert"
          >
            {t("meeting.page.loadFailed")}
          </p>
        ) : (
          // "No meetings yet" only once the list has said so.
          meetings !== null && (
            <p className="min-w-0 flex-1 self-start rounded-2xl border border-hairline bg-surface px-5 py-4 text-sm">
              {t("meeting.page.empty")}
            </p>
          )
        )}
      </div>
    </div>
  );
};

const MeetingDetail: React.FC<{
  entry: MeetingEntry;
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** Transcript lines an answer used, marked on the transcript tab. */
  cited: Cited;
}> = ({ entry, tab, onTab, cited }) => {
  const { t } = useTranslation();
  const { meeting } = entry;
  const view = notesView(meeting.notes_state, meeting.notes !== null);
  const writing = view.kind === "writing";

  const file = {
    title: entry.title,
    notes: shownNotes(view, meeting.notes),
    transcript: entry.transcript,
  };

  const copy = async () => {
    const text = copyText(tab, file.notes, entry.transcript);
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
      className={`whitespace-nowrap rounded-xl px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-logo-primary ${
        tab === value ? "bg-glass-chosen font-medium" : "hover:bg-glass-hover"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="flex-1 min-w-0 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="me-auto min-w-0 truncate text-base font-semibold">
          {entry.title}
        </h2>
        <Button variant="secondary" size="sm" onClick={copy}>
          {t("meeting.page.copy")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => saveAs("md")}>
          {t("meeting.page.saveMd")}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => saveAs("txt")}>
          {t("meeting.page.saveTxt")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="me-auto flex gap-1"
          role="group"
          aria-label={t("meeting.page.view")}
        >
          {tabButton("notes", t("meeting.page.notesTab"))}
          {tabButton("transcript", t("meeting.page.transcriptTab"))}
        </div>
        {/* The template the notes are written with; choosing one rewrites
            them (SE-MEET-010). */}
        {/* With no template yet, the menu's placeholder names it. A meeting
            stored with no AI can be written once AI is there (SE-MEET-010). */}
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
      </div>

      {tab === "transcript" ? (
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
