import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronDown } from "lucide-react";
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
  selectMenu,
  selectOption,
  selectOptionChosen,
} from "../../ui/selectStyles";
import { Button } from "../../ui/Button";

/** meeting.rs session::STATE_EVENT. */
const STATE_EVENT = "meeting-state";

const NO_SOURCES: MeetingSources = { automatic: null, apps: [] };

// SE-MEET-021
/** Start / Stop for a meeting opened by hand, with a menu beside Start that
 *  picks the sound source for the next start. The choice lasts while the
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
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // Button takes no ref (React 18): the chevron is found by its popup role.
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
    setStarting(true);
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
      setStarting(false);
    }
  };

  const appName =
    mode === "idle"
      ? plannedApp(source, sources, pickedName)
      : (state?.app_name ?? null);
  const line = recordLine(mode === "recording", appName);
  const phaseText =
    state?.phase === "transcribing"
      ? t("meeting.transcribing")
      : state?.phase === "notes"
        ? t("meeting.notes")
        : null;

  const items = sourceItems(source, sources);

  return (
    <div ref={wrap} className="space-y-2">
      <div className="relative flex">
        <Button
          variant="primary"
          size="md"
          className="min-w-0 flex-1 rounded-e-none"
          disabled={mode === "busy" || starting}
          onClick={
            mode === "recording"
              ? () => commands.stopMeeting().catch((e) => setError(String(e)))
              : start
          }
        >
          {mode === "recording" ? t("meeting.stop") : t("meeting.start.button")}
        </Button>
        <Button
          variant="primary"
          size="md"
          aria-label={t("meeting.start.chooseSource")}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex-none rounded-s-none border-s-hairline px-2"
          disabled={mode !== "idle" || starting}
          onClick={toggleMenu}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </Button>
        {open && (
          <div
            ref={menu}
            role="menu"
            aria-label={t("meeting.start.chooseSource")}
            className={`${selectMenu} start-0 end-0 max-h-60 overflow-y-auto`}
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
      <p className="text-xs text-mid-gray" role="status">
        {phaseText ?? t(line.key, { app: line.app })}
      </p>
      {error && (
        <p className="text-xs text-error" role="alert">
          {t(`meeting.errors.${meetingErrorKey(error)}`)}
        </p>
      )}
    </div>
  );
};
