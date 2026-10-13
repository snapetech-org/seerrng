import {
  forwardRef,
  type ButtonHTMLAttributes,
  type FocusEventHandler,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

export const selectFromRow = (
  event: MouseEvent<HTMLElement>,
  onSelect: () => void
) => {
  const target = event.target;
  const interactiveTarget =
    target instanceof Element
      ? target.closest(
          'a, button, input, select, textarea, [role="button"], [data-no-row-select]'
        )
      : null;
  if (interactiveTarget && interactiveTarget !== event.currentTarget) {
    return;
  }
  onSelect();
};

export const selectFromRowKey = (
  event: KeyboardEvent<HTMLElement>,
  onSelect: () => void
) => {
  if (
    event.target !== event.currentTarget ||
    (event.key !== 'Enter' && event.key !== ' ')
  ) {
    return;
  }
  event.preventDefault();
  onSelect();
};

interface SelectionCircleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'disabled' | 'id' | 'name'
> {
  selected: boolean;
  partial?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  'data-testid'?: string;
  label?: string;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  onClick: () => void;
}

const SelectionCircleGlyph = () => (
  <svg
    className="selection-circle-icon"
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.5"
  >
    <circle cx="12" cy="12" r="9" />
    <path
      d="M9 12.75 11.25 15 15 9.75"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Shared circle appearance inside an existing selection control, not a nested button. */
export const SelectionCircleIndicator = ({
  selected,
  partial = false,
  disabled = false,
}: Pick<SelectionCircleProps, 'selected' | 'partial' | 'disabled'>) => (
  <span
    className="selection-circle"
    data-selected={selected || undefined}
    data-partial={partial || undefined}
    data-disabled={disabled || undefined}
    aria-hidden="true"
  >
    <SelectionCircleGlyph />
  </span>
);

const SelectionCircle = forwardRef<HTMLButtonElement, SelectionCircleProps>(
  (
    {
      selected,
      partial = false,
      disabled = false,
      id,
      name,
      'data-testid': dataTestId,
      label,
      onBlur,
      onClick,
      ...buttonProps
    },
    ref
  ) => (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      id={id}
      name={name}
      data-testid={dataTestId}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onBlur={onBlur}
      aria-label={label}
      aria-pressed={partial ? 'mixed' : selected}
      data-partial={partial || undefined}
      className="selection-circle"
    >
      <SelectionCircleGlyph />
    </button>
  )
);

SelectionCircle.displayName = 'SelectionCircle';

export default SelectionCircle;
