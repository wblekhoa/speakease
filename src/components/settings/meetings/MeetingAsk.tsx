import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type MeetingAnswer } from "@/bindings";
import { askError, transcriptLine } from "@/lib/meeting";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";

/** One question and what came back. */
export type Exchange = {
  question: string;
  answer?: MeetingAnswer;
  /** An i18n key when asking failed. */
  error?: string;
};

// SE-MEET-014
/** Questions about one meeting, answered from its transcript and notes. Each
 *  answer quotes the lines it used, so a wrong one shows at once (an engine
 *  may cite a line on another subject rather than say the meeting is silent). */
export const MeetingAsk: React.FC<{
  historyId: number;
  transcript: string;
  exchanges: Exchange[];
  onExchanges: (update: (exchanges: Exchange[]) => Exchange[]) => void;
  /** Marks `lines` on the transcript tab and scrolls to `line`. */
  onShowLines: (lines: number[], line: number) => void;
}> = ({ historyId, transcript, exchanges, onExchanges, onShowLines }) => {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  // Known before typing: with no AI the form gives way to the reason.
  const [noAi, setNoAi] = useState<string | null>(null);
  useEffect(() => {
    commands
      .meetingAiMissing()
      .then(setNoAi)
      .catch(() => setNoAi(null));
  }, []);
  // The newest answer (or the "looking" line) is scrolled into view; the
  // page scrolls, as the tab is as long as its answers.
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [exchanges.length, asking]);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || asking) return;
    setAsking(true);
    setQuestion("");
    let exchange: Exchange;
    try {
      const result = await commands.askMeeting(historyId, asked);
      exchange =
        result.status === "ok"
          ? { question: asked, answer: result.data }
          : { question: asked, error: askError(result.error) };
    } catch {
      exchange = { question: asked, error: askError("") };
    } finally {
      setAsking(false);
    }
    onExchanges((list) => [...list, exchange]);
  };

  return (
    // The Ask tab of a meeting (SE-MEET-024): the tab names it, so no title.
    <div className="space-y-3">
      <p className="text-sm text-mid-gray">{t("meeting.page.ask.hint")}</p>
      <ol ref={list} className="space-y-3">
        {exchanges.map((exchange, i) => (
          <li
            key={i}
            className="space-y-2 rounded-2xl border border-hairline bg-surface px-4 py-3"
          >
            <p className="text-sm font-medium">{exchange.question}</p>
            {exchange.error && (
              <p className="text-sm text-mid-gray">{t(exchange.error)}</p>
            )}
            {exchange.answer && !exchange.answer.found && (
              <p className="text-sm">{t("meeting.page.ask.notFound")}</p>
            )}
            {exchange.answer?.found && (
              <>
                <p className="whitespace-pre-wrap text-sm">
                  {exchange.answer.text}
                </p>
                {exchange.answer.lines.length === 0 ? (
                  <p className="text-sm text-mid-gray">
                    {t("meeting.page.ask.noLines")}
                  </p>
                ) : (
                  <ul className="space-y-1 border-t border-dotted border-hairline pt-2">
                    {exchange.answer.lines.map((n) => (
                      <li key={n}>
                        <button
                          type="button"
                          onClick={() => onShowLines(exchange.answer!.lines, n)}
                          className="w-full rounded-lg text-start text-sm text-mid-gray transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-logo-primary"
                        >
                          <span className="whitespace-nowrap font-medium tabular-nums underline underline-offset-2">
                            {t("meeting.page.ask.line", { n })}
                          </span>{" "}
                          {transcriptLine(transcript, n)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </li>
        ))}
        {asking && (
          <li className="text-sm text-mid-gray" role="status">
            {t("meeting.page.ask.asking")}
          </li>
        )}
      </ol>
      {noAi ? (
        <p className="text-sm text-mid-gray">
          {t(`meeting.page.ask.noAi.${noAi}`)}
        </p>
      ) : (
        <form onSubmit={ask} className="flex gap-2">
          <Input
            type="text"
            variant="compact"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("meeting.page.ask.placeholder")}
            aria-label={t("meeting.page.ask.title")}
            className="min-w-0 flex-1"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={asking || !question.trim()}
          >
            {t("meeting.page.ask.send")}
          </Button>
        </form>
      )}
    </div>
  );
};
