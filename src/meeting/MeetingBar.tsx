import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, type MeetingState } from "@/bindings";
import { elapsed, meetingErrorKey } from "@/lib/meeting";
import "./MeetingBar.css";

/** The event meeting.rs sends on every change (session::STATE_EVENT). */
const STATE_EVENT = "meeting-state";

// SE-MEET-004
/** The meeting bar: the consent line, a timer and Stop while recording; what
 *  is being done after the stop; an error until it is closed. */
const MeetingBar: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<MeetingState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    commands.meetingState().then(setState);
    const unlisten = listen<MeetingState>(STATE_EVENT, (event) =>
      setState(event.payload),
    );
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  const recording = state?.phase === "recording";
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  if (!state) return null;

  if (state.phase === "idle" && state.error) {
    return (
      <div className="mb-bar mb-error" role="alert">
        <span className="mb-text">
          {t(`meeting.errors.${meetingErrorKey(state.error)}`)}
        </span>
        <button
          type="button"
          className="mb-close"
          aria-label={t("meeting.close")}
          onClick={() => commands.closeMeetingBar()}
        >
          ×
        </button>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="mb-bar" role="status">
        <span className="mb-dot" aria-hidden="true" />
        <span className="mb-text">{t("meeting.consent")}</span>
        {state.started_at != null && (
          <span className="mb-timer">{elapsed(state.started_at, now)}</span>
        )}
        <button
          type="button"
          className="mb-stop"
          onClick={() => commands.stopMeeting()}
        >
          {t("meeting.stop")}
        </button>
      </div>
    );
  }

  if (state.phase === "transcribing" || state.phase === "notes") {
    return (
      <div className="mb-bar" role="status">
        <span className="mb-spinner" aria-hidden="true" />
        <span className="mb-text">{t(`meeting.${state.phase}`)}</span>
      </div>
    );
  }

  return null;
};

export default MeetingBar;
