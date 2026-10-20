import React, { useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/dpi";
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
/** Space around the card inside the window (LiveSubtitles.css .ls-frame). */
const FRAME_PADDING = 8;
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
  const cardRef = useRef<HTMLDivElement>(null);
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

  // The window follows the card's height and keeps its bottom edge, so the
  // bar grows upward as lines arrive and no empty glass sits over the video.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const window = getCurrentWindow();
    let last = 0;
    const fit = async () => {
      const height = Math.ceil(card.offsetHeight) + FRAME_PADDING * 2;
      if (Math.abs(height - last) < 2) return;
      last = height;
      try {
        const scale = await window.scaleFactor();
        const position = await window.outerPosition();
        const size = await window.outerSize();
        const bottom = position.y + size.height;
        await window.setSize(new LogicalSize(size.width / scale, height));
        await window.setPosition(
          new PhysicalPosition(position.x, Math.round(bottom - height * scale)),
        );
      } catch {
        // Outside the app (browser preview): nothing to fit.
      }
    };
    const observer = new ResizeObserver(() => void fit());
    observer.observe(card);
    return () => observer.disconnect();
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
  } else if (view.items.length === 0) {
    body = (
      <p className="ls-status">
        {view.listening
          ? t("subtitles.listening", { app })
          : t("subtitles.starting")}
      </p>
    );
  } else {
    // Oldest at the top, fading. The newest translated line stays at full
    // strength while the line after it is still being translated - it is
    // the one being read.
    const lastTranslated = view.items.reduce(
      (last, item, n) => (item.target ? n : last),
      -1,
    );
    const ageOf = (n: number) => Math.max(0, lastTranslated - n);
    body = (
      <ol className="ls-lines">
        {view.items.map((item, n) => (
          <li
            key={item.index}
            className="ls-line"
            data-age={ageOf(n)}
            aria-current={n === view.items.length - 1 ? "true" : undefined}
          >
            <p className="ls-source" dir="auto">
              {item.source}
            </p>
            {item.target ? (
              <p className="ls-target" dir="auto">
                {item.target}
              </p>
            ) : (
              <p
                className="ls-target ls-pending"
                aria-label={t("subtitles.translating")}
              >
                <span />
                <span />
                <span />
              </p>
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="ls-frame">
      <div
        ref={cardRef}
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
