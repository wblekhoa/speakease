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
/** Whether what was heard shows under each translation (this Mac only). */
const SOURCE_KEY = "speakease.liveSubtitles.showSource";
/** Space around the content inside the window (LiveSubtitles.css .ls-frame). */
const FRAME_PADDING = 16;
/** Gap between the pill and the bubbles (LiveSubtitles.css .ls-content). */
const CONTENT_GAP = 8;
/** The panel grows to show at most this many bubbles, then scrolls (owner). */
const MAX_BUBBLES = 4;
/** A hard ceiling, for very long bubbles. */
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

const readShowSource = () => {
  try {
    return localStorage.getItem(SOURCE_KEY) !== "false";
  } catch {
    return true;
  }
};

const saveShowSource = (on: boolean) => {
  try {
    localStorage.setItem(SOURCE_KEY, String(on));
  } catch {
    // Storage unavailable: the choice lasts until the panel reloads.
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
  /** More lines above than the panel shows: fade its top edge. */
  const [moreAbove, setMoreAbove] = useState(false);
  // SE-LIVE-011
  // The panel's two switches (owner, 20/10): translate on/off, which stops
  // the AI calls, and the heard text under each translation shown/hidden.
  const [translateOn, setTranslateOn] = useState(true);
  const [showSource, setShowSource] = useState(readShowSource);
  const wasRunning = useRef(false);
  const headRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = subtitleView(state);

  useEffect(() => {
    const window = getCurrentWindow();
    const saved = readPosition();
    if (saved) {
      window.setPosition(new LogicalPosition(saved.x, saved.y)).catch(() => {});
    }
    commands
      .liveSubtitlesState()
      .then((current) => {
        setTranslateOn(current.translate);
        wasRunning.current = current.running;
      })
      .catch(() => {});
    const subscriptions = [
      listen<SubtitleEvent>("live-subtitle", (event) => apply(event.payload)),
      // A new session starts clean.
      // A new session starts clean: only on the switch from off to on, as
      // the Translate switch announces the state too.
      listen<{ running: boolean; translate: boolean }>(
        "live-subtitles-state",
        (event) => {
          setTranslateOn(event.payload.translate);
          if (event.payload.running && !wasRunning.current) {
            apply("reset");
            setFollowing(true);
          }
          wasRunning.current = event.payload.running;
        },
      ),
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
  // Measured from the list's natural height, not the scroller's: the
  // scroller is clamped to the window, so measuring it would keep the window
  // at its opening height for ever (20/10, the panel stuck at one line).
  useEffect(() => {
    const head = headRef.current;
    const list = listRef.current;
    if (!head || !list) return;
    const window = getCurrentWindow();
    let last = 0;
    const fit = async () => {
      // The newest MAX_BUBBLES bubbles at their own heights.
      const bubbles = Array.from(list.children).slice(
        -MAX_BUBBLES,
      ) as HTMLElement[];
      const shown =
        bubbles.reduce((sum, bubble) => sum + bubble.offsetHeight, 0) +
        CONTENT_GAP * Math.max(0, bubbles.length - 1);
      const natural =
        head.offsetHeight +
        CONTENT_GAP +
        Math.min(list.offsetHeight, shown) +
        FRAME_PADDING * 2;
      const height = Math.min(MAX_HEIGHT, Math.ceil(natural));
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
    observer.observe(head);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Keep the newest line in view unless the user scrolled up to read.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (following) scroller.scrollTop = scroller.scrollHeight;
    setMoreAbove(scroller.scrollTop > 1);
  }, [state, following]);

  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const fromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setFollowing(fromBottom < STICK_PX);
    setMoreAbove(scroller.scrollTop > 1);
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
      <div className="ls-content">
        {/* The handle: what is being subtitled, and how to stop. */}
        <header className="ls-head" ref={headRef} onMouseDown={startDrag}>
          <span
            aria-hidden
            className={`ls-dot${view.listening && !view.error ? " ls-live" : ""}`}
          />
          <span className="ls-app">{app}</span>
          <span className="ls-switches">
            <button
              type="button"
              className="ls-switch"
              aria-pressed={translateOn}
              title={t("subtitles.switchTranslate")}
              onClick={() => {
                const next = !translateOn;
                setTranslateOn(next);
                commands.setLiveSubtitlesTranslate(next);
              }}
            >
              {t("subtitles.translateShort")}
            </button>
            <button
              type="button"
              className="ls-switch"
              aria-pressed={showSource}
              disabled={!translateOn}
              title={t("subtitles.switchSource")}
              onClick={() => {
                setShowSource(!showSource);
                saveShowSource(!showSource);
              }}
            >
              {t("subtitles.sourceShort")}
            </button>
          </span>
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
          className={`ls-scroll${moreAbove ? " ls-more-above" : ""}${
            following ? "" : " ls-more-below"
          }`}
          ref={scrollRef}
          onScroll={onScroll}
          onMouseDown={startDrag}
          role="log"
          aria-live="polite"
          aria-label={t("subtitles.label")}
        >
          <div className="ls-list" ref={listRef}>
            {status ? (
              <p
                className={`ls-bubble ls-status${view.error ? " ls-error" : ""}`}
              >
                {status}
              </p>
            ) : (
              view.items.map((item) => {
                // Translation off (or never arrived while off): the heard
                // text is the bubble's main line.
                const translated = item.target !== null;
                const asHeard = !translated && !translateOn;
                return (
                  <article key={item.index} className="ls-bubble">
                    {asHeard ? (
                      <p className="ls-target" dir="auto">
                        {item.source}
                      </p>
                    ) : translated ? (
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
                    {!asHeard && (showSource || !translateOn) && (
                      <p className="ls-source" dir="auto">
                        {item.source}
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </div>
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
