import React from "react";

/**
 * Names an icon-only control the moment the pointer or the keyboard reaches
 * it - a native `title` takes a second to appear and looks foreign. Wrap the
 * button; the label is shown above it (or where `side` says) and is also
 * the button's accessible name, so pass the same text as its aria-label.
 */
export const IconTip: React.FC<{
  label: string;
  side?: "top" | "bottom" | "right";
  /** Keep the label inside a container whose edge the control sits on. */
  align?: "center" | "end";
  /** Extra classes for the wrapper, e.g. its place in a flex column. */
  className?: string;
  children: React.ReactNode;
}> = ({ label, side = "top", align = "center", className = "", children }) => {
  const position =
    side === "right"
      ? "left-full top-1/2 ms-2 -translate-y-1/2"
      : `${side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${
          align === "end" ? "end-0" : "left-1/2 -translate-x-1/2"
        }`;
  return (
    <span className={`relative group/tip inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity delay-150 group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100 ${position}`}
      >
        {label}
      </span>
    </span>
  );
};
