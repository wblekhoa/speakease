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
/** A hard ceiling, for very long bubbles. */
const MAX_HEIGHT = 760;
// SE-LIVE-013
/** The panel's look, set from its ⚙ sheet (owner, 21/10; this Mac only). */
const LOOK_KEY = "speakease.liveSubtitles.look";
/** The window's width bounds, padding included (subtitle_window.rs WIDTH). */
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;

const TEXT_SIZES = { s: 0.85, m: 1, l: 1.18, xl: 1.36 } as const;
type TextSize = keyof typeof TEXT_SIZES;

interface Look {
  textSize: TextSize;
  /** How solid the bubbles are, in percent (the blur shows through). */
  background: number;
  /** The panel grows to show at most this many bubbles, then scrolls. */
  lines: number;
  /** The window's width in points (its edges are dragged). */
  width: number;
}

const DEFAULT_LOOK: Look = {
  textSize: "m",
  background: 62,
  lines: 4,
  width: 472,
};

const readLook = (): Look => {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Look>) : {};
    return {
      textSize:
        saved.textSize && saved.textSize in TEXT_SIZES
          ? saved.textSize
          : DEFAULT_LOOK.textSize,
      background: Math.min(100, Math.max(20, saved.background ?? 62)),
      lines: Math.min(6, Math.max(1, saved.lines ?? 4)),
      width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, saved.width ?? 472)),
    };
  } catch {
    return DEFAULT_LOOK;
  }
};

const saveLook = (look: Look) => {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // Storage unavailable: the look lasts until the panel reloads.
  }
};
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
  const [look, setLook] = useState(readLook);
  const lookRef = useRef(look);
  lookRef.current = look;
  const [lookOpen, setLookOpen] = useState(false);
  // SE-LIVE-014
  // Play/pause sends the system media key; the app cannot tell whether the
  // media is playing, so the icon follows the last press (playing at start).
  const [paused, setPaused] = useState(false);
  /** The tallest the panel has been this session; it does not shrink back
   * (see the fit below). Zeroed when a session starts or a switch changes
   * what a bubble holds. */
  const peak = useRef(0);
  const headRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = subtitleView(state);

  useEffect(() => {
    const window = getCurrentWindow();
    const width = lookRef.current.width;
    // The saved width first (the panel opens at the default one), right
    // edge kept as it opens in the right corner; then the saved spot.
    (width !== DEFAULT_LOOK.width
      ? commands.fitLiveSubtitlesPanel(null, width, true)
      : Promise.resolve()
    )
      .catch(() => {})
      .finally(() => void restorePosition(window));
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
            setPaused(false);
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
      // The newest bubbles (as many as the look allows) at their heights.
      const bubbles = Array.from(list.children).slice(
        -lookRef.current.lines,
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
      commands.fitLiveSubtitlesPanel(height, null, false).catch(() => {
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
    if (
      (event.target as HTMLElement).closest("button, input, .ls-look, .ls-edge")
    )
      return;
    getCurrentWindow()
      .startDragging()
      .catch(() => {});
  };

  const changeLook = (patch: Partial<Look>) => {
    const next = { ...lookRef.current, ...patch };
    peak.current = 0;
    setLook(next);
    saveLook(next);
  };

  // Drag a side edge to change the width; the other edge stays put. Pointer
  // capture keeps the moves coming while the pointer is outside the panel.
  const startResize =
    (side: "left" | "right") => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget as HTMLElement;
      handle.setPointerCapture(event.pointerId);
      const startX = event.screenX;
      const startWidth = lookRef.current.width;
      let width = startWidth;
      let frame = 0;
      const move = (e: PointerEvent) => {
        const delta = e.screenX - startX;
        width = Math.round(
          Math.min(
            MAX_WIDTH,
            Math.max(
              MIN_WIDTH,
              startWidth + (side === "right" ? delta : -delta),
            ),
          ),
        );
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          commands
            .fitLiveSubtitlesPanel(null, width, side === "left")
            .catch(() => {});
        });
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        changeLook({ width });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    };

  const quiet =
    !lookOpen && view.updatedAt > 0 && now - view.updatedAt > QUIET_MS;
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
      style={
        {
          "--ls-scale": TEXT_SIZES[look.textSize],
          "--ls-alpha": `${look.background}%`,
          "--ls-width": `${look.width}px`,
        } as React.CSSProperties
      }
    >
      <div
        className="ls-edge ls-edge-left"
        aria-hidden
        onPointerDown={startResize("left")}
      />
      <div
        className="ls-edge ls-edge-right"
        aria-hidden
        onPointerDown={startResize("right")}
      />
      <div className="ls-content">
        <div className="ls-top" ref={headRef}>
          {/* The handle: what is being subtitled, and how to stop. */}
          <header className="ls-head">
            {/* Three groups (owner, 21/10): what is subtitled, the text
                switches, the actions. */}
            <span className="ls-group ls-group-app">
              <span
                aria-hidden
                className={`ls-dot${view.listening && !view.error ? " ls-live" : ""}`}
              />
              <span className="ls-app">{app}</span>
            </span>
            <span className="ls-group ls-switches">
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
            <span className="ls-group ls-actions">
              <button
                type="button"
                className="ls-close ls-media"
                aria-label={t(
                  paused ? "subtitles.media.play" : "subtitles.media.pause",
                )}
                title={t(
                  paused ? "subtitles.media.play" : "subtitles.media.pause",
                )}
                onClick={() => {
                  commands
                    .liveSubtitlesPlayPause()
                    .then((sent) => {
                      if (sent) setPaused(!paused);
                    })
                    .catch(() => {});
                }}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                  {paused ? (
                    <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" />
                  ) : (
                    <path
                      d="M4 3h2.6v10H4zM9.4 3H12v10H9.4z"
                      fill="currentColor"
                    />
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="ls-close ls-gear"
                aria-pressed={lookOpen}
                aria-expanded={lookOpen}
                aria-label={t("subtitles.look.open")}
                title={t("subtitles.look.open")}
                onClick={() => {
                  peak.current = 0;
                  setLookOpen(!lookOpen);
                }}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                  <path
                    d="M2 4h7M13 4h1M2 12h1M7 12h7M2 8h3M9 8h5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="11"
                    cy="4"
                    r="1.75"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="5"
                    cy="12"
                    r="1.75"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="7"
                    cy="8"
                    r="1.75"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="ls-close"
                onClick={() => commands.stopLiveSubtitles()}
                aria-label={t("subtitles.stop")}
                title={t("subtitles.stop")}
              >
                ×
              </button>
            </span>
          </header>

          {lookOpen && (
            <section className="ls-look" aria-label={t("subtitles.look.open")}>
              <div className="ls-look-row">
                <span className="ls-look-label">
                  {t("subtitles.look.textSize")}
                </span>
                <span className="ls-segments">
                  {(Object.keys(TEXT_SIZES) as TextSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      className="ls-segment"
                      aria-pressed={look.textSize === size}
                      onClick={() => changeLook({ textSize: size })}
                    >
                      {t(`subtitles.look.sizes.${size}`)}
                    </button>
                  ))}
                </span>
              </div>
              <label className="ls-look-row">
                <span className="ls-look-label">
                  {t("subtitles.look.background")}
                </span>
                <input
                  type="range"
                  className="ls-range"
                  min={20}
                  max={100}
                  step={2}
                  value={look.background}
                  onChange={(e) =>
                    changeLook({ background: Number(e.target.value) })
                  }
                />
                <span className="ls-look-value">{look.background}%</span>
              </label>
              <div className="ls-look-row">
                <span className="ls-look-label">
                  {t("subtitles.look.lines")}
                </span>
                <span className="ls-segments">
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className="ls-segment ls-segment-number"
                      aria-pressed={look.lines === count}
                      onClick={() => changeLook({ lines: count })}
                    >
                      {count}
                    </button>
                  ))}
                </span>
              </div>
              <p className="ls-look-hint">{t("subtitles.look.widthHint")}</p>
            </section>
          )}
        </div>

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
