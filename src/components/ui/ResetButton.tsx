import React from "react";
import { useTranslation } from "react-i18next";
import ResetIcon from "../icons/ResetIcon";
import { IconTip } from "./IconTip";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export const ResetButton: React.FC<ResetButtonProps> = React.memo(
  ({ onClick, disabled = false, className = "", ariaLabel, children }) => {
    const { t } = useTranslation();
    // Without a label of its own it is the "back to the default" button.
    const label = ariaLabel ?? t("common.resetToDefault");
    return (
      <IconTip label={label} align="end">
        <button
          type="button"
          aria-label={label}
          className={`p-1 rounded-md border border-transparent transition-all duration-150 ${
            disabled
              ? "opacity-50 cursor-not-allowed text-text/40"
              : "hover:bg-logo-primary/30 active:bg-logo-primary/50 active:translate-y-[1px] hover:cursor-pointer hover:border-logo-primary text-text/80"
          } ${className}`}
          onClick={onClick}
          disabled={disabled}
        >
          {children ?? <ResetIcon />}
        </button>
      </IconTip>
    );
  },
);
