import React, { useEffect, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { commands } from "@/bindings";
import {
  applySubtitleEvent,
  emptySubtitles,
  subtitleErrorKey,
  subtitleView,
  type SubtitleEvent,
} from "@/lib/liveSubtitles";
import "./LiveSubtitles.css";

/** Where the user last dragged the bar (this Mac only). */
const POSITION_KEY = "speakease.liveSubtitles.position";
/** The bar dims after this long without speech. */
const QUIET_MS = 6000;

const readPosition = (): { x: number; y: number } | null => {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const savePosition = (x: number, y: number) => {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ x, y }));
  } catch {
    // Storage unavailable: the bar just opens at the bottom centre.
  }
};

/** The floating bilingual bar (SE-LIVE). */
const LiveSubtitles: React.FC = () => {
  const { t } = useTranslation();
  const [state, apply] = useReducer(
    (
      current: ReturnType<typeof emptySubtitles>,
      event: SubtitleEvent | "reset",
    ) =>
      event === "reset"
        ? emptySubtitles()
        : applySubtitleEvent(current, event, Date.now()),
    undefined,
    emptySubtitles,
  );
  const [now, setNow] = useState(Date.now());
  const view = subtitleView(state);

  useEffect(() => {
    const window = getCurrentWindow();
    const saved = readPosition();
    if (saved) {
      window.setPosition(new LogicalPosition(saved.x, saved.y)).catch(() => {});
    }
    const subscriptions = [
      listen<SubtitleEvent>("live-subtitle", (event) => apply(event.payload)),
      // A new session starts clean.
      listen<{ running: boolean }>("live-subtitles-state", (event) => {
        if (event.payload.running) apply("reset");
      }),
      window.onMoved(async ({ payload }) => {
        const scale = await window.scaleFactor();
        savePosition(payload.x / scale, payload.y / scale);
      }),
    ];
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(clock);
      subscriptions.forEach((p) => p.then((stop) => stop()));
    };
  }, []);

  const startDrag = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    getCurrentWindow()
      .startDragging()
      .catch(() => {});
  };

  const quiet = view.updatedAt > 0 && now - view.updatedAt > QUIET_MS;
  const app = view.appName ?? t("subtitles.theApp");
  let body: React.ReactNode;
  if (view.error) {
    body = (
      <p className="ls-status ls-error">
        {t(`subtitles.errors.${subtitleErrorKey(view.error)}`, { app })}
      </p>
    );
  } else if (!view.source) {
    body = (
      <p className="ls-status">
        {view.listening
          ? t("subtitles.listening", { app })
          : t("subtitles.starting")}
      </p>
    );
  } else {
    body = (
      <>
        <p className="ls-source">
          <span dir="auto">{view.source}</span>
        </p>
        <p className="ls-target" dir="auto">
          {view.target || " "}
        </p>
      </>
    );
  }

  return (
    <div className="ls-frame">
      <div
        className={`ls-card${quiet ? " ls-quiet" : ""}`}
        onMouseDown={startDrag}
        role="region"
        aria-live="polite"
        aria-label={t("subtitles.label")}
      >
        <button
          type="button"
          className="ls-close"
          onClick={() => commands.stopLiveSubtitles()}
          aria-label={t("subtitles.stop")}
          title={t("subtitles.stop")}
        >
          ×
        </button>
        {body}
      </div>
    </div>
  );
};

export default LiveSubtitles;
