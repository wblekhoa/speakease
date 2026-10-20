import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "./Tooltip";

/** An info icon that shows `children` in a tooltip on hover, focus or
 * click - the same icon SettingContainer uses for descriptions. */
export const InfoTip: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={t("common.moreInfo")}
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      // Hover and focus already open it, so a click only keeps it open
      // (a toggle would close what the hover just opened).
      onClick={() => setOpen(true)}
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      className="relative inline-grid place-items-center rounded-full text-mid-gray hover:text-logo-primary cursor-help focus-visible:outline-2 focus-visible:outline-logo-primary"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {open && (
        <Tooltip targetRef={ref} position="top" width={320}>
          <div className="py-1 text-[13px] leading-snug text-start text-text normal-case tracking-normal font-normal">
            {children}
          </div>
        </Tooltip>
      )}
    </button>
  );
};
