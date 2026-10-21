import React, {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { availableMonitors, getCurrentWindow } from "@tauri-apps/api/window";
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

/** The panel's bottom-left corner in logical points. The bottom, not the
 * top: the panel grows upward, so a saved top crept higher on every launch
 * (audit, 21/10). Older saves hold the top ("y") and are read as they are. */
interface SavedPosition {
  x: number;
  y?: number;
  bottom?: number;
}

const readPosition = (): SavedPosition | null => {
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

const savePosition = (x: number, bottom: number) => {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ x, bottom }));
  } catch {
    // Storage unavailable: the panel just opens in its default corner.
  }
};

/** Puts the panel back where the user left it, if that spot is still on a
 * screen (a display may have been unplugged); else it stays in its default
 * corner. */
const restorePosition = async (window: ReturnType<typeof getCurrentWindow>) => {
  const saved = readPosition();
  if (!saved) return;
  try {
    const scale = await window.scaleFactor();
    const height = (await window.outerSize()).height / scale;
    const width = (await window.outerSize()).width / scale;
    const y = saved.bottom !== undefined ? saved.bottom - height : saved.y;
    if (y === undefined) return;
    const onScreen = (await availableMonitors()).some((monitor) => {
      const s = monitor.scaleFactor;
      const left = monitor.position.x / s;
      const top = monitor.position.y / s;
      return (
        saved.x + width / 2 >= left &&
        saved.x + width / 2 <= left + monitor.size.width / s &&
        y + height / 2 >= top &&
        y + height / 2 <= top + monitor.size.height / s
      );
    });
    if (onScreen) await window.setPosition(new LogicalPosition(saved.x, y));
  } catch {
    // Outside the app (browser preview): nothing to restore.
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
  /** The tallest the panel has been this session; it does not shrink back
   * (see the fit below). Zeroed when a session starts or a switch changes
   * what a bubble holds. */
  const peak = useRef(0);
  const headRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = subtitleView(state);

  useEffect(() => {
    const window = getCurrentWindow();
    void restorePosition(window);
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
      listen<{ running: boolean; translate: boolean; error: string | null }>(
        "live-subtitles-state",
        (event) => {
          setTranslateOn(event.payload.translate);
          // Ended without an error: clear the hidden panel now, so the next
          // session does not open on these bubbles at their old height.
          // An error stays shown until then.
          const endedCleanly =
            !event.payload.running &&
            wasRunning.current &&
            !event.payload.error;
          if (endedCleanly || (event.payload.running && !wasRunning.current)) {
            peak.current = 0;
            apply("reset");
            setFollowing(true);
          }
          wasRunning.current = event.payload.running;
        },
      ),
      window.onMoved(async ({ payload }) => {
        const scale = await window.scaleFactor();
        const size = await window.outerSize();
        savePosition(payload.x / scale, (payload.y + size.height) / scale);
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
  // video beneath. It only grows within a session: shrinking whenever a
  // short line replaced a long one moved the whole panel on every line
  // (owner, 21/10: the panel jumped); older lines fill any extra room.
  // Measured from the list's natural height, not the scroller's: the
  // scroller is clamped to the window, so measuring it would keep the window
  // at its opening height for ever (20/10, the panel stuck at one line).
  useEffect(() => {
    const head = headRef.current;
    const list = listRef.current;
    if (!head || !list) return;
    let last = 0;
    const fit = () => {
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
      const height = Math.max(
        peak.current,
        Math.min(MAX_HEIGHT, Math.ceil(natural)),
      );
      peak.current = height;
      if (Math.abs(height - last) < 2) return;
      last = height;
      // One native step, bottom edge kept (subtitle_window.rs fit_height).
      commands.fitLiveSubtitlesPanel(height).catch(() => {
        // Outside the app (browser preview): nothing to fit.
      });
    };
    const observer = new ResizeObserver(fit);
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
    // Any empty spot of the box drags it (owner, 21/10), not only the pill
    // and the bubbles; buttons keep their clicks.
    <div
      className={`ls-frame${quiet ? " ls-quiet" : ""}`}
      onMouseDown={startDrag}
    >
      <div className="ls-content">
        {/* The handle: what is being subtitled, and how to stop. */}
        <header className="ls-head" ref={headRef}>
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
                peak.current = 0;
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
                peak.current = 0;
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
                // No translation coming (Translate off, or the AI failed):
                // the heard text is the bubble's main line.
                const translated = item.target !== null;
                const asHeard = !translated && (item.heardOnly || !translateOn);
                return (
                  <article
                    key={item.index}
                    className="ls-bubble"
                    // A line still being heard is rewritten about once a
                    // second; screen readers get it once it is final.
                    aria-hidden={item.final ? undefined : true}
                  >
                    {asHeard ? (
                      <p className="ls-target" dir="auto">
                        {item.source}
                      </p>
                    ) : translated ? (
                      <p className="ls-target" dir="auto">
                        {item.target}
                      </p>
                    ) : (
                      <p className="ls-target ls-pending">
                        <span aria-hidden />
                        <span aria-hidden />
                        <span aria-hidden />
                        <span className="ls-sr-only">
                          {t("subtitles.translating")}
                        </span>
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
