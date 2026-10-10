import React from "react";
import mark from "../../assets/speakease-mark.png";

// SpeakEase wordmark: the app's own icon, shrunk, beside the name set in
// the display face (Plus Jakarta Sans, as ReadEase titles are). Real text,
// not SVG text, so it renders crisp and in the loaded face. "Ease" takes
// the brand pink, SpeakEase's own colour (theme.css). The file keeps
// its upstream name so merges from Handy stay small.

// A brand name, not copy: it is the same in every language.
const SPEAK = "Speak";
const EASE = "Ease";

const HandyTextLogo = ({
  width = 124,
  className = "",
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  // Everything scales off the width the caller asks for.
  const fontSize = Math.round(width / 6.6);
  const markSize = Math.round(fontSize * 1.65);
  return (
    <div
      role="img"
      aria-label={`${SPEAK}${EASE}`}
      className={`flex items-center select-none ${className}`}
      style={{ gap: Math.round(fontSize * 0.5) }}
    >
      <img
        src={mark}
        alt=""
        width={markSize}
        height={markSize}
        draggable={false}
        className="shrink-0 drop-shadow-[0_2px_6px_color-mix(in_srgb,var(--color-logo-primary)_35%,transparent)]"
      />
      <span
        aria-hidden
        className="font-display font-bold leading-none"
        style={{ fontSize, letterSpacing: "-0.02em" }}
      >
        <span className="text-text">{SPEAK}</span>
        <span className="text-logo-primary">{EASE}</span>
      </span>
    </div>
  );
};

export default HandyTextLogo;
