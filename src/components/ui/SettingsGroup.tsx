import React from "react";
import { InfoTip } from "./InfoTip";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  /** A description behind an info icon beside the title instead. */
  info?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  info,
  children,
}) => {
  return (
    <div className="space-y-2">
      {title && (
        <div className="px-4">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-mid-gray uppercase tracking-wide">
            {title}
            {info && <InfoTip>{info}</InfoTip>}
          </h2>
          {description && (
            <p className="text-xs text-mid-gray mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="bg-surface border border-hairline rounded-2xl overflow-visible">
        <div className="divide-y divide-hairline">{children}</div>
      </div>
    </div>
  );
};
