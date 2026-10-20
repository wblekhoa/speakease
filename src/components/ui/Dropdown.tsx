import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  selectChevron,
  selectMenuSurface,
  selectOption,
  selectOptionChosen,
  selectTrigger,
  selectTriggerDisabled,
  selectTriggerEnabled,
} from "./selectStyles";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  /** Width classes for a menu wider than its trigger; it then lines up with
   * the trigger's right edge. */
  menuClassName?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onOpen?: () => void;
}

/** The menu's tallest size, its gap to the trigger and to the window edge. */
const MENU_MAX = 240;
const GAP = 6;
const EDGE = 8;

interface MenuPlace {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number;
  maxHeight: number;
}

/**
 * Where the menu goes: under the trigger when it fits there, else above it
 * when there is more room above (owner, 21/10: a menu near the bottom of the
 * window was cut off). Drawn in a portal at fixed coordinates, so no card or
 * scrolling column can clip it.
 */
const placeMenu = (
  trigger: DOMRect,
  natural: number,
  alignEnd: boolean,
): MenuPlace => {
  const below = window.innerHeight - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;
  const wanted = Math.min(MENU_MAX, natural);
  const up = below < wanted && above > below;
  const room = Math.max(0, up ? above : below);
  return {
    ...(up
      ? { bottom: window.innerHeight - trigger.top + GAP }
      : { top: trigger.bottom + GAP }),
    ...(alignEnd
      ? { right: window.innerWidth - trigger.right }
      : { left: trigger.left, width: trigger.width }),
    maxHeight: Math.min(MENU_MAX, room),
  };
};

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  menuClassName,
  placeholder = "Select an option...",
  disabled = false,
  onOpen,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updatePlace = useCallback(() => {
    const trigger = dropdownRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    // The menu's full height, measured before it is capped.
    const natural = menu.scrollHeight + (menu.offsetHeight - menu.clientHeight);
    setPlace(placeMenu(trigger, natural, Boolean(menuClassName)));
  }, [menuClassName]);

  // Placed before it paints, then kept beside the trigger while the page
  // scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!isOpen) {
      setPlace(null);
      return;
    }
    updatePlace();
    // The menu sits at the end of the page (a portal), so Tab would not
    // reach it: focus goes into it, arrows move, Escape returns (audit).
    const choices = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const list = choices();
        if (list.length === 0) return;
        event.preventDefault();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        list[(at + step + list.length) % list.length].focus();
      }
    };
    window.addEventListener("scroll", updatePlace, true);
    window.addEventListener("resize", updatePlace);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", updatePlace, true);
      window.removeEventListener("resize", updatePlace);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, updatePlace]);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  // Into the menu once it is placed (a hidden element cannot take focus).
  const placed = place !== null;
  useEffect(() => {
    if (!isOpen || !placed) return;
    const menu = menuRef.current;
    (
      menu?.querySelector<HTMLButtonElement>(
        '[aria-selected="true"]:not(:disabled)',
      ) ?? menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")
    )?.focus({ preventScroll: true });
  }, [isOpen, placed]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) onOpen?.();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`${selectTrigger} w-full ${
          disabled ? selectTriggerDisabled : selectTriggerEnabled
        }`}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg
          className={`${selectChevron} ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen &&
        !disabled &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={`${selectMenuSurface} overflow-y-auto ${
              menuClassName ?? ""
            }`}
            style={{
              position: "fixed",
              zIndex: 9999,
              top: place?.top,
              bottom: place?.bottom,
              left: place?.left,
              right: place?.right,
              width: place?.width,
              maxHeight: place?.maxHeight,
              visibility: place ? "visible" : "hidden",
            }}
          >
            {options.length === 0 ? (
              <div className="px-2 py-1 text-sm text-mid-gray">
                {t("common.noOptionsFound")}
              </div>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selectedValue === option.value}
                  className={`${selectOption} ${
                    selectedValue === option.value ? selectOptionChosen : ""
                  } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                >
                  <span
                    className={`block whitespace-normal break-words ${
                      option.description ? "font-medium" : ""
                    }`}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 block whitespace-normal text-xs font-normal leading-snug text-mid-gray">
                      {option.description}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};
