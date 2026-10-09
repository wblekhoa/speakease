import React from "react";
import SelectComponent from "react-select";
import CreatableSelect from "react-select/creatable";
import type {
  ActionMeta,
  Props as ReactSelectProps,
  SingleValue,
  StylesConfig,
} from "react-select";

export type SelectOption = {
  value: string;
  label: string;
  isDisabled?: boolean;
};

type BaseProps = {
  value: string | null;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isClearable?: boolean;
  onChange: (value: string | null, action: ActionMeta<SelectOption>) => void;
  onBlur?: () => void;
  className?: string;
  formatCreateLabel?: (input: string) => string;
};

type CreatableProps = {
  isCreatable: true;
  onCreateOption: (value: string) => void;
};

type NonCreatableProps = {
  isCreatable?: false;
  onCreateOption?: never;
};

export type SelectProps = BaseProps & (CreatableProps | NonCreatableProps);

// SpeakEase: the same look as Dropdown and LanguageSelector
// (selectStyles.ts) - a neutral row fill with a 12px corner, a menu on the
// raised surface, rows that fill on hover and turn brand-blue when chosen.
const rowFill = "var(--color-row)";
const hairline = "var(--color-hairline)";
const brand = "var(--color-logo-primary)";

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderRadius: 12,
    borderColor: state.isFocused ? brand : "transparent",
    boxShadow: "none",
    backgroundColor: rowFill,
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "var(--color-text)",
    transition: "border-color 150ms ease",
    ":hover": {
      borderColor: state.isFocused ? brand : hairline,
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingInline: 10,
    paddingBlock: 2,
  }),
  input: (base) => ({
    ...base,
    color: "var(--color-text)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--color-text)",
  }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base, state) => ({
    ...base,
    paddingInline: 8,
    color: "var(--color-mid-gray)",
    transform: state.selectProps.menuIsOpen ? "rotate(180deg)" : undefined,
    transition: "transform 200ms ease",
    ":hover": { color: "var(--color-text)" },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--color-mid-gray)",
    ":hover": { color: "var(--color-text)" },
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 30,
    marginTop: 6,
    padding: 4,
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
    borderRadius: 12,
    border: `1px solid ${hairline}`,
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.24)",
  }),
  menuList: (base) => ({ ...base, padding: 0 }),
  option: (base, state) => ({
    ...base,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: "0.875rem",
    backgroundColor:
      state.isSelected || state.isFocused ? rowFill : "transparent",
    color: state.isSelected ? brand : "var(--color-text)",
    fontWeight: state.isSelected ? 500 : 400,
    cursor: state.isDisabled ? "not-allowed" : "pointer",
    opacity: state.isDisabled ? 0.5 : 1,
    ":active": { backgroundColor: rowFill },
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--color-mid-gray)",
  }),
};

export const Select: React.FC<SelectProps> = React.memo(
  ({
    value,
    options,
    placeholder,
    disabled,
    isLoading,
    isClearable = true,
    onChange,
    onBlur,
    className = "",
    isCreatable,
    formatCreateLabel,
    onCreateOption,
  }) => {
    const selectValue = React.useMemo(() => {
      if (!value) return null;
      const existing = options.find((option) => option.value === value);
      if (existing) return existing;
      return { value, label: value, isDisabled: false };
    }, [value, options]);

    const handleChange = (
      option: SingleValue<SelectOption>,
      action: ActionMeta<SelectOption>,
    ) => {
      onChange(option?.value ?? null, action);
    };

    const sharedProps: Partial<ReactSelectProps<SelectOption, false>> = {
      className,
      classNamePrefix: "app-select",
      value: selectValue,
      options,
      onChange: handleChange,
      placeholder,
      isDisabled: disabled,
      isLoading,
      onBlur,
      isClearable,
      styles: selectStyles,
    };

    if (isCreatable) {
      return (
        <CreatableSelect<SelectOption, false>
          {...sharedProps}
          onCreateOption={onCreateOption}
          formatCreateLabel={formatCreateLabel}
        />
      );
    }

    return <SelectComponent<SelectOption, false> {...sharedProps} />;
  },
);

Select.displayName = "Select";
