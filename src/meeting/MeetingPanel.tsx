import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type LiveLine,
  type LiveView,
  type Suggestion,
} from "@/bindings";
import { notesView } from "@/lib/meeting";

const LEVELS = [1, 2, 3, 4, 5] as const;
/** How long a new suggestion shows on its own before it folds in. */
const FRESH_MS = 4000;

type Row =
  | { kind: "line"; at: number; line: LiveLine }
  | { kind: "card"; at: number; card: Suggestion };

const cardKey = (card: Suggestion) => `${card.at_ms}|${card.kind}|${card.text}`;

/** Lines and suggestion cards in the order they came; `fresh` cards show
 *  only at the top until they fold in. */
const rows = (view: LiveView, fresh: Suggestion[]): Row[] => {
  const all: Row[] = view.lines.map((line) => ({
    kind: "line",
    at: line.at_ms,
    line,
  }));
  if (view.level >= 5) {
    // Each live event carries new objects, so cards are matched by content.
    const shown = new Set(fresh.map(cardKey));
    for (const card of view.suggestions) {
      if (shown.has(cardKey(card))) continue;
      all.push({ kind: "card", at: card.at_ms, card });
    }
  }
  return all.sort((a, b) => a.at - b.at);
};

// SE-MEET-005, SE-MEET-007, SE-MEET-016
/** The live panel under the meeting bar: the level for this meeting, the
 *  live transcript (2), "what did I miss?" (3), the summary (4) and
 *  suggestion cards (5). Suggestions are only shown, never sent anywhere. */
export const MeetingPanel: React.FC<{ view: LiveView }> = ({ view }) => {
  const { t } = useTranslation();
  const level = view.level;
  const list = useRef<HTMLOListElement>(null);
  const [catchUp, setCatchUp] = useState<string | null>(null);
  const [catching, setCatching] = useState(false);
  const [fresh, setFresh] = useState<Suggestion[]>([]);
  const seen = useRef(new Set(view.suggestions.map(cardKey)));

  // A new suggestion first shows on its own, then folds into the list.
  // Matched by content: the oldest cards drop off once 30 are kept.
  useEffect(() => {
    const added = view.suggestions.filter(
      (card) => !seen.current.has(cardKey(card)),
    );
    seen.current = new Set(view.suggestions.map(cardKey));
    if (level >= 5 && added.length > 0) setFresh(added);
  }, [view.suggestions, level]);

  // Its own timer, so new lines arriving meanwhile do not keep it up.
  useEffect(() => {
    if (fresh.length === 0) return;
    const timer = window.setTimeout(() => setFresh([]), FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  // The newest line stays in view unless the user scrolled back; the
  // panel opens at the newest line.
  const count = view.lines.length + view.suggestions.length;
  const opened = useRef(false);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearEnd || !opened.current) el.scrollTo({ top: el.scrollHeight });
    opened.current = true;
  }, [count, level]);

  const askCatchUp = async () => {
    setCatching(true);
    try {
      const result = await commands.meetingCatchUp();
      if (result.status === "ok") {
        setCatchUp(result.data);
      } else if (result.error.startsWith("empty:")) {
        setCatchUp(t("meeting.live.nothingYet"));
      } else {
        // The same "no_ai:<reason>" the notes carry.
        const why = notesView(result.error, false);
        setCatchUp(
          t(
            why.kind === "noAi"
              ? `meeting.live.noAi.${why.reason}`
              : "meeting.live.failed",
          ),
        );
      }
    } catch {
      setCatchUp(t("meeting.live.failed"));
    } finally {
      setCatching(false);
    }
  };

  return (
    <section className="mp-panel" aria-label={t("meeting.live.title")}>
      <div
        className="mp-levels"
        role="radiogroup"
        aria-label={t("meeting.live.level")}
      >
        {LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={level === n}
            className="mp-level"
            onClick={() => commands.setMeetingLiveLevel(n)}
          >
            {t(`meeting.live.levels.${n}`)}
          </button>
        ))}
      </div>

      {level === 1 && <p className="mp-note">{t("meeting.live.only")}</p>}
      {level >= 3 && view.ai_missing && (
        <p className="mp-note">{t(`meeting.live.noAi.${view.ai_missing}`)}</p>
      )}

      {level >= 4 && !view.ai_missing && (
        <div className="mp-card mp-summary">
          <h3 className="mp-card-title">{t("meeting.live.summary")}</h3>
          <p className="mp-card-text">
            {view.summary ?? t("meeting.live.summaryWaiting")}
          </p>
        </div>
      )}

      {level >= 3 && (
        <div className="mp-catch-up">
          <button
            type="button"
            className="mb-no"
            disabled={catching || view.ai_missing != null}
            onClick={askCatchUp}
          >
            {t("meeting.live.catchUp")}
          </button>
          {catching && (
            <p className="mp-note" role="status">
              {t("meeting.live.catchingUp")}
            </p>
          )}
          {!catching && catchUp && (
            <p className="mp-card-text mp-card">{catchUp}</p>
          )}
        </div>
      )}

      {level >= 5 && fresh.length > 0 && (
        <ul className="mp-fresh" aria-live="polite">
          {fresh.map((card) => (
            <li key={cardKey(card)} className="mp-suggestion mp-suggestion-new">
              <span className="mp-kind">
                {t(`meeting.live.kinds.${card.kind}`)}
              </span>
              {card.text}
            </li>
          ))}
        </ul>
      )}

      {level >= 2 && (
        <ol ref={list} className="mp-lines">
          {view.lines.length === 0 && (
            <li className="mp-note">{t("meeting.live.listening")}</li>
          )}
          {rows(view, fresh).map((row) =>
            row.kind === "line" ? (
              <li
                key={`l|${row.at}|${row.line.me}|${row.line.text}`}
                className="mp-line"
              >
                {/* SE-MEET-020: a microphone-only meeting has no labels. */}
                {!view.microphone_only && (
                  <>
                    <span className="mp-who">
                      {t(
                        row.line.me ? "meeting.live.me" : "meeting.live.others",
                      )}
                    </span>{" "}
                  </>
                )}
                {row.line.text}
              </li>
            ) : (
              <li key={cardKey(row.card)} className="mp-suggestion">
                <span className="mp-kind">
                  {t(`meeting.live.kinds.${row.card.kind}`)}
                </span>
                {row.card.text}
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
};
