import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { commands, type MeetingEntry } from "@/bindings";
import {
  duration,
  exportMeeting,
  meetingFileName,
  NOTE_KINDS,
  notesView,
} from "@/lib/meeting";
import { Button } from "../../ui/Button";
import { Dropdown } from "../../ui/Dropdown";
import { MarkdownContent } from "../../whats-new/MarkdownContent";
import { copyToClipboard } from "../history/clipboard";

/** Events that change the list (meeting.rs NOTES_EVENT and STATE_EVENT). */
const NOTES_EVENT = "meeting-notes-updated";
const STATE_EVENT = "meeting-state";

type Tab = "notes" | "transcript";

// SE-MEET-018
/** Meetings (beta): the list on the left, the chosen meeting on the right -
 *  its notes, checked against the transcript one click away. */
export const MeetingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<MeetingEntry[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("notes");

  const refresh = useCallback(() => {
    commands.listMeetings().then((result) => {
      if (result.status !== "ok") return;
      setMeetings(result.data);
      setChosen(
        (current) => current ?? result.data[0]?.meeting.history_id ?? null,
      );
    });
  }, []);

  useEffect(() => {
    refresh();
    const notes = listen(NOTES_EVENT, refresh);
    const state = listen(STATE_EVENT, refresh);
    return () => {
      notes.then((stop) => stop());
      state.then((stop) => stop());
    };
  }, [refresh]);

  if (meetings === null) return null;
  if (meetings.length === 0) {
    return (
      <div className="max-w-3xl w-full mx-auto">
        <p className="rounded-2xl border border-hairline bg-surface px-5 py-4 text-sm">
          {t("meeting.page.empty")}
        </p>
      </div>
    );
  }

  const entry =
    meetings.find((m) => m.meeting.history_id === chosen) ?? meetings[0];
  // dd/mm HH:MM, as in the meeting's History title (meeting.rs).
  const startedAt = (seconds: number) => {
    const at = new Date(seconds * 1000);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${two(at.getDate())}/${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
  };

  return (
    <div className="w-full mx-auto flex gap-4 min-h-0">
      <ul
        className="w-56 flex-none space-y-1"
        aria-label={t("sidebar.meetings")}
      >
        {meetings.map((m) => {
          const active = m.meeting.history_id === entry.meeting.history_id;
          return (
            <li key={m.meeting.history_id}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  setChosen(m.meeting.history_id);
                  setTab("notes");
                }}
                className={`w-full rounded-xl px-3 py-2 text-start transition-colors ${
                  active ? "bg-glass-chosen" : "hover:bg-glass-hover"
                }`}
              >
                <span className="block truncate text-sm font-medium">
                  {m.meeting.app_name}
                </span>
                <span className="block text-xs text-mid-gray tabular-nums">
                  {startedAt(m.meeting.started_at)} ·{" "}
                  {duration(m.meeting.duration_ms)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <MeetingDetail
        key={entry.meeting.history_id}
        entry={entry}
        tab={tab}
        onTab={setTab}
      />
    </div>
  );
};

const MeetingDetail: React.FC<{
  entry: MeetingEntry;
  tab: Tab;
  onTab: (tab: Tab) => void;
}> = ({ entry, tab, onTab }) => {
  const { t } = useTranslation();
  const { meeting } = entry;
  const view = notesView(meeting.notes_state, meeting.notes !== null);
  const writing = view.kind === "writing";

  const file = {
    title: entry.title,
    notes:
      view.kind === "notes" || view.kind === "empty" ? meeting.notes : null,
    transcript: entry.transcript,
  };

  const copy = async () => {
    const text = tab === "notes" && file.notes ? file.notes : entry.transcript;
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
      className={`rounded-full px-3 py-1 text-sm transition-colors ${
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
        <div className="me-auto flex gap-1" role="group">
          {tabButton("notes", t("meeting.page.notesTab"))}
          {tabButton("transcript", t("meeting.page.transcriptTab"))}
        </div>
        {/* The template the notes are written with; choosing one rewrites
            them (SE-MEET-010). */}
        <Dropdown
          className="flex-none"
          options={NOTE_KINDS.map((kind) => ({
            value: kind,
            label: t(`meeting.page.kinds.${kind}`),
          }))}
          selectedValue={meeting.kind}
          placeholder={t("meeting.page.template")}
          onSelect={rewrite}
          disabled={writing || view.kind === "noAi"}
        />
      </div>

      {tab === "transcript" ? (
        <pre className="whitespace-pre-wrap rounded-2xl border border-hairline bg-surface px-5 py-4 font-sans text-sm leading-relaxed">
          {entry.transcript}
        </pre>
      ) : (
        <div className="space-y-3 rounded-2xl border border-hairline bg-surface px-5 py-4">
          {view.kind === "notes" && (
            <>
              {/* Every engine measured made 1-3 name or number errors an
                  hour: the notes are AI output to check (SE-MEET fixed). */}
              <p className="text-sm text-mid-gray">
                {t("meeting.page.check")}{" "}
                <button
                  type="button"
                  onClick={() => onTab("transcript")}
                  className="underline underline-offset-2 hover:text-text"
                >
                  {t("meeting.page.openTranscript")}
                </button>
              </p>
              <MarkdownContent markdown={meeting.notes ?? ""} />
            </>
          )}
          {view.kind === "writing" && (
            <p className="text-sm">{t("meeting.page.writing")}</p>
          )}
          {view.kind === "empty" && <p className="text-sm">{meeting.notes}</p>}
          {view.kind === "failed" && (
            <p className="text-sm">{t("meeting.page.failed")}</p>
          )}
          {/* SE-MEET-012: with no AI, the user is told why. */}
          {view.kind === "noAi" && (
            <p className="text-sm">{t(`meeting.page.noAi.${view.reason}`)}</p>
          )}
          {(view.kind === "failed" || view.kind === "noAi") && (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {entry.transcript}
            </pre>
          )}
        </div>
      )}
    </section>
  );
};
