/**
 * SpeakEase: the one look every hand-built select shares (Dropdown,
 * LanguageSelector), so two pickers side by side read as the same control:
 * a neutral row fill with the control radius, a menu on the raised
 * surface, and rows that fill on hover and turn brand-blue when chosen.
 */
export const selectTrigger =
  "h-9 px-3 text-sm font-medium bg-row border border-transparent rounded-xl min-w-[200px] text-start flex items-center justify-between gap-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-logo-primary";

export const selectTriggerEnabled = "cursor-pointer hover:border-hairline";

export const selectTriggerDisabled = "opacity-50 cursor-not-allowed";

export const selectMenuSurface =
  "p-1 bg-surface border border-hairline rounded-xl shadow-xl";

export const selectMenu = `absolute top-full mt-1.5 ${selectMenuSurface} z-50`;

export const selectOption =
  "w-full px-2.5 py-1.5 rounded-lg text-sm text-start transition-colors duration-150 hover:bg-row";

export const selectOptionChosen = "bg-row text-logo-primary font-medium";

export const selectChevron =
  "w-4 h-4 shrink-0 text-mid-gray transition-transform duration-200";
