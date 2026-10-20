import React, {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
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

/** Where the user last dragged the panel (this Mac only). */
const POSITION_KEY = "speakease.liveSubtitles.position";
/** Space around the content inside the window (LiveSubtitles.css .ls-frame). */
const FRAME_PADDING = 10;
/** The panel grows with its lines up to this height, then scrolls. */
const MAX_HEIGHT = 560;
/** Within this distance of the bottom counts as "reading the newest". */
const STICK_PX = 40;
/** The panel dims after this long without speech. */
const QUIET_MS = 8000;

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
    // Storage unavailable: the panel just opens in its default corner.
  }
};

/** The floating subtitle panel (SE-LIVE-008): one bubble per line, newest
 * at the bottom, like a chat (owner's reference, 20/10). */
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
  const [following, setFollowing] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
        if (event.payload.running) {
          apply("reset");
          setFollowing(true);
        }
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

  // The window follows its content's height (up to MAX_HEIGHT) and keeps
  // its bottom edge, so it grows upward and leaves no empty glass over the
  // video beneath.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const window = getCurrentWindow();
    let last = 0;
    const fit = async () => {
      const height = Math.min(
        MAX_HEIGHT,
        Math.ceil(content.scrollHeight) + FRAME_PADDING * 2,
      );
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
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Keep the newest line in view unless the user scrolled up to read.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && following) scroller.scrollTop = scroller.scrollHeight;
  }, [state, following]);

  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const fromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setFollowing(fromBottom < STICK_PX);
  };

  const jumpToNewest = () => {
    setFollowing(true);
    const scroller = scrollRef.current;
    if (scroller)
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  };

  const startDrag = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    getCurrentWindow()
      .startDragging()
      .catch(() => {});
  };

  const quiet = view.updatedAt > 0 && now - view.updatedAt > QUIET_MS;
  const app = view.appName ?? t("subtitles.theApp");
  const status = view.error
    ? t(`subtitles.errors.${subtitleErrorKey(view.error)}`, { app })
    : view.items.length === 0
      ? view.listening
        ? t("subtitles.listening", { app })
        : t("subtitles.starting")
      : null;

  return (
    <div className={`ls-frame${quiet ? " ls-quiet" : ""}`}>
      <div className="ls-content" ref={contentRef}>
        {/* The handle: what is being subtitled, and how to stop. */}
        <header className="ls-head" onMouseDown={startDrag}>
          <span
            aria-hidden
            className={`ls-dot${view.listening && !view.error ? " ls-live" : ""}`}
          />
          <span className="ls-app">{app}</span>
          <button
            type="button"
            className="ls-close"
            onClick={() => commands.stopLiveSubtitles()}
            aria-label={t("subtitles.stop")}
            title={t("subtitles.stop")}
          >
            ×
          </button>
        </header>

        <div
          className="ls-scroll"
          ref={scrollRef}
          onScroll={onScroll}
          onMouseDown={startDrag}
          role="log"
          aria-live="polite"
          aria-label={t("subtitles.label")}
        >
          {status ? (
            <p
              className={`ls-bubble ls-status${view.error ? " ls-error" : ""}`}
            >
              {status}
            </p>
          ) : (
            view.items.map((item) => (
              <article key={item.index} className="ls-bubble">
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
                <p className="ls-source" dir="auto">
                  {item.source}
                </p>
              </article>
            ))
          )}
        </div>
      </div>

      {!following && (
        <button
          type="button"
          className="ls-newest"
          onClick={jumpToNewest}
          aria-label={t("subtitles.newest")}
          title={t("subtitles.newest")}
        >
          ↓
        </button>
      )}
    </div>
  );
};

export default LiveSubtitles;
