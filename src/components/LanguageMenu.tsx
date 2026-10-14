import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, GlobeIcon } from "./icons/bulk";
import { IconTip } from "./ui/IconTip";
import { useSettings } from "../hooks/useSettings";
import {
  SUPPORTED_LANGUAGES,
  getSupportedLanguage,
  type SupportedLanguageCode,
} from "../i18n";

// SE-APP-011
/** The interface language, in its own menu at the foot of the side column so
 * it is found without opening App (owner, 14/10). The same setting as App ›
 * Appearance › Language; the tray menu follows it. */
export const LanguageMenu: React.FC<{ collapsed: boolean }> = ({
  collapsed,
}) => {
  const { t, i18n } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = (getSupportedLanguage(settings?.app_language) ||
    getSupportedLanguage(i18n.language) ||
    "en") as SupportedLanguageCode;
  const currentName =
    SUPPORTED_LANGUAGES.find((lang) => lang.code === current)?.nativeName ??
    current;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (code: string) => {
    setOpen(false);
    if (code === current) return;
    i18n.changeLanguage(code);
    updateSetting("app_language", code);
  };

  const label = t("sidebar.language");
  const button = (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`${label}: ${currentName}`}
      className={`flex items-center gap-2.5 rounded-xl text-start cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-logo-primary ${
        collapsed
          ? "size-11 shrink-0 self-center justify-center"
          : "w-full py-2 px-3"
      } ${open ? "bg-glass-chosen text-text" : "text-text/80 hover:bg-glass-hover"}`}
    >
      <GlobeIcon
        width={20}
        height={20}
        className={`shrink-0 ${open ? "text-text" : "text-mid-gray"}`}
      />
      {!collapsed && <span className="text-sm truncate">{currentName}</span>}
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-col ${collapsed ? "items-center" : ""}`}
    >
      {collapsed && !open ? (
        <IconTip label={`${label}: ${currentName}`} side="right">
          {button}
        </IconTip>
      ) : (
        button
      )}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute z-50 w-56 p-1.5 rounded-2xl border border-hairline bg-surface shadow-2xl ${
            collapsed ? "left-full bottom-0 ms-2" : "bottom-full left-0 mb-1.5"
          }`}
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mid-gray">
            {label}
          </p>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="menuitemradio"
              aria-checked={lang.code === current}
              onClick={() => choose(lang.code)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-sm text-start cursor-pointer hover:bg-row"
            >
              <span>
                {lang.nativeName}
                {lang.nativeName !== lang.name && (
                  <span className="text-mid-gray"> · {lang.name}</span>
                )}
              </span>
              {lang.code === current && (
                <CheckIcon
                  width={16}
                  height={16}
                  className="text-logo-primary"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
