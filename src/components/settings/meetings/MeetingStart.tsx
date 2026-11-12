import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronUp } from "lucide-react";
import { commands, type MeetingSources, type MeetingState } from "@/bindings";
import {
  AUTOMATIC,
  controlMode,
  fallsBackToAutomatic,
  meetingErrorKey,
  plannedApp,
  recordLine,
  sourceItems,
  type SourceChoice,
} from "@/lib/meeting";
import {
  selectMenuSurface,
  selectOption,
  selectOptionChosen,
} from "../../ui/selectStyles";

/** meeting.rs session::STATE_EVENT. */
const STATE_EVENT = "meeting-state";

const NO_SOURCES: MeetingSources = { automatic: null, apps: [] };

// SE-MEET-021, SE-MEET-024
/** Start / Stop for a meeting opened by hand, in the bar at the bottom of
 *  the Meetings list, with a menu above it that picks the sound source for
 *  the next start. The choice lasts while the
 *  page is mounted and is not stored. Whoever started a meeting (this
 *  button, the shortcut, the tray, the call question), the control follows
 *  the `meeting-state` event. */
export const MeetingStart: React.FC = () => {
  const { t } = useTranslation();
  const [source, setSource] = useState<SourceChoice>(AUTOMATIC);
  // The chosen app's name, kept so the line still names it if the app has
  // gone by the time Start reports it.
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [sources, setSources] = useState<MeetingSources>(NO_SOURCES);
  const [state, setState] = useState<MeetingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A start or a stop that has not answered yet: no second one meanwhile.
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // The source button is found by its popup role.
  const focusChevron = () =>
    wrap.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus();
  const menu = useRef<HTMLDivElement>(null);

  const loadSources = useCallback(
    () => commands.meetingSources().then(setSources),
    [],
  );

  useEffect(() => {
    loadSources();
    commands.meetingState().then(setState);
    const unlisten = listen<MeetingState>(STATE_EVENT, (event) => {
      setState(event.payload);
      // What Automatic would record changes as call apps come and go.
      if (event.payload.phase === "idle") loadSources();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [loadSources]);

  const mode = controlMode(state?.phase ?? "idle");

  // A meeting that starts or ends closes the menu and any old error.
  useEffect(() => {
    if (mode !== "idle") setOpen(false);
    if (mode === "recording") setError(null);
  }, [mode]);

  // Closed by a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // Into the menu once it opens: the ticked row, else the first.
  useEffect(() => {
    if (!open) return;
    (
      menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
      menu.current?.querySelector<HTMLButtonElement>("button")
    )?.focus();
  }, [open]);

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // The list is a snapshot: asked again every time the menu opens.
    loadSources();
    setOpen(true);
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      focusChevron();
    } else if (event.key === "Tab") {
      setOpen(false);
      focusChevron();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const rows = Array.from(
        menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      );
      if (rows.length === 0) return;
      event.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      rows[(at + step + rows.length) % rows.length].focus();
    }
  };

  const pick = (choice: SourceChoice, name?: string) => {
    setSource(choice);
    setPickedName(name ?? null);
    // An error belongs to the start it came from, not to the new choice.
    setError(null);
    setOpen(false);
    focusChevron();
  };

  const start = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await commands.startMeeting(source);
      if (result.status === "ok") return;
      setError(result.error);
      if (fallsBackToAutomatic(result.error)) {
        setSource(AUTOMATIC);
        setPickedName(null);
        loadSources();
      }
    } catch (e) {
      // A command that threw: shown as the generic error, never a stuck button.
      setError(String(e));
    } finally {
      setPending(false);
    }
  };

  const stop = async () => {
    setPending(true);
    try {
      await commands.stopMeeting();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };

  // While the bar asks about a call, Automatic records that app: Start is
  // then a Yes (meeting.rs source_when_asked).
  const asked = state?.phase === "asking" ? state.app_name : null;

  const appName =
    mode === "idle"
      ? plannedApp(source, sources, pickedName, asked)
      : (state?.app_name ?? null);
  const line = recordLine(mode === "recording", appName);
  const phaseText =
    state?.phase === "transcribing"
      ? t("meeting.transcribing")
      : state?.phase === "notes"
        ? t("meeting.notes")
        : null;

  const items = sourceItems(source, sources, asked);
  const recording = mode === "recording";
  const status = phaseText ?? t(line.key, { app: line.app });

  // SE-MEET-024: one floating bar like the Speak and Live subtitles pages
  // (owner, 12/11): what will be recorded, which opens the source menu
  // above it, and Start / Stop. Errors show above the bar.
  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      {error && (
        <p
          className="max-w-full rounded-xl border border-hairline bg-surface px-3 py-1.5 text-xs text-error shadow-sm"
          role="alert"
        >
          {t(`meeting.errors.${meetingErrorKey(error)}`)}
        </p>
      )}
      <div
        ref={wrap}
        className="relative flex max-w-full items-center gap-1 rounded-full border border-hairline bg-surface p-1.5 shadow-sm"
      >
        <button
          type="button"
          aria-label={`${t("meeting.start.chooseSource")}: ${status}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={mode !== "idle" || pending}
          onClick={toggleMenu}
          className="flex h-9 min-w-0 items-center gap-2 rounded-full px-3 text-sm cursor-pointer enabled:hover:bg-row disabled:cursor-default focus-visible:outline-2 focus-visible:outline-logo-primary"
        >
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${
              recording
                ? "bg-logo-primary animate-pulse motion-reduce:animate-none"
                : "bg-mid-gray/50"
            }`}
          />
          <span className="truncate font-medium" role="status">
            {status}
          </span>
          {mode === "idle" && (
            <ChevronUp
              className={`h-4 w-4 shrink-0 text-mid-gray transition-transform duration-200 motion-reduce:transition-none ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          )}
        </button>
        <button
          type="button"
          // Pending and finishing keep the button focusable (aria-disabled,
          // not disabled), so keyboard focus is not dropped to the page.
          aria-disabled={pending || mode === "busy" || undefined}
          onClick={
            pending || mode === "busy" ? undefined : recording ? stop : start
          }
          className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-logo-primary ${
            recording
              ? "bg-row text-text hover:bg-mid-gray/25 aria-disabled:hover:bg-row"
              : "text-white bg-background-ui hover:bg-brand-deep aria-disabled:hover:bg-background-ui"
          }`}
        >
          {recording ? t("meeting.stop") : t("meeting.start.button")}
        </button>
        {open && (
          <div
            ref={menu}
            role="menu"
            aria-label={t("meeting.start.chooseSource")}
            // Above the bar: it sits at the bottom of the page.
            className={`${selectMenuSurface} absolute bottom-full start-0 z-50 mb-2 max-h-60 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto`}
            onKeyDown={onMenuKey}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.ticked}
                onClick={() => pick(item.source, item.name)}
                className={`${selectOption} flex items-start gap-2 focus-visible:outline-2 focus-visible:outline-logo-primary ${
                  item.ticked ? selectOptionChosen : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words">
                    {item.kind === "automatic"
                      ? t("meeting.start.automatic")
                      : item.kind === "microphone"
                        ? t("meeting.start.microphoneOnly")
                        : item.name}
                  </span>
                  {item.kind === "automatic" && (
                    <span className="block text-xs font-normal text-mid-gray">
                      {item.hint
                        ? t("meeting.start.automaticApp", { app: item.hint })
                        : t("meeting.start.automaticMic")}
                    </span>
                  )}
                </span>
                {item.ticked && (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
