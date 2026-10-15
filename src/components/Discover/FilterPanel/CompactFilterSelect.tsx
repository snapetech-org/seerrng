import { Listbox, Transition } from '@headlessui/react';
import {
  NoSymbolIcon,
  StarIcon as OutlineStarIcon,
} from '@heroicons/react/24/outline';
import {
  CheckIcon,
  ChevronDownIcon,
  StarIcon as SolidStarIcon,
} from '@heroicons/react/24/solid';
import { Fragment } from 'react';

let closingOtherFilterMenus = false;

const closeOtherFilterMenus = (current: HTMLButtonElement) => {
  if (closingOtherFilterMenus) return;

  closingOtherFilterMenus = true;
  try {
    document
      .querySelectorAll<HTMLButtonElement>(
        'button.app-filter-select-trigger[aria-expanded="true"]'
      )
      .forEach((button) => {
        if (button !== current) button.click();
      });
  } finally {
    closingOtherFilterMenus = false;
  }
};

export const getFilterResetButtonClass = (selected: boolean) =>
  `app-filter-button ${
    selected ? 'app-filter-button-active' : 'app-filter-button-idle'
  }`;

export const getFilterToggleButtonClass = (selected: boolean) =>
  `app-filter-button ${
    selected ? 'app-filter-button-active' : 'app-filter-button-idle'
  }`;

export const FilterResetButton = ({
  label,
  selected = false,
  onClick,
  className = '',
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    className={`${getFilterResetButtonClass(selected)} ${className}`.trim()}
    onClick={onClick}
  >
    <NoSymbolIcon className="app-action-icon" aria-hidden="true" />
    {label}
  </button>
);

export type CompactSelectOption = {
  label: string;
  value: string;
};

export type RangeOption = CompactSelectOption & {
  gte?: string;
  lte?: string;
};

export type RatingOption = RangeOption & {
  score?: number;
};

type CompactSelectProps = {
  label: string;
  value: string;
  options: CompactSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  defaultValue?: string;
};

export const CompactSelect = ({
  label,
  value,
  options,
  onChange,
  className = '',
  defaultValue,
}: CompactSelectProps) => {
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const isActive = value !== (defaultValue ?? options[0]?.value);

  return (
    <Listbox value={selected} onChange={(option) => onChange(option.value)}>
      <div className={`discover-filter-control ${className}`}>
        <span
          className={`discover-filter-control-label ${
            isActive ? 'discover-filter-control-label-active' : ''
          }`}
        >
          {label}
        </span>
        <Listbox.Button
          aria-label={label}
          className="app-control-shadow-exempt app-filter-select-trigger"
          onClickCapture={(event) => closeOtherFilterMenus(event.currentTarget)}
        >
          <span>{selected.label}</span>
          <ChevronDownIcon
            className="app-filter-select-chevron"
            aria-hidden="true"
          />
        </Listbox.Button>
        <Transition as={Fragment}>
          <Listbox.Options
            anchor="bottom start"
            portal
            modal={false}
            className="app-filter-select-menu app-filter-select-menu-floating"
          >
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                value={option}
                className={({ active }) =>
                  `app-filter-select-option ${
                    active ? 'app-filter-select-option-active' : ''
                  }`
                }
              >
                {({ selected: optionSelected }) => (
                  <>
                    {optionSelected && (
                      <CheckIcon
                        className="app-filter-select-check"
                        aria-hidden="true"
                      />
                    )}
                    <span>{option.label}</span>
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
};

const RatingStars = ({
  score,
  maxScore,
}: {
  score: number;
  maxScore: 5 | 10;
}) => (
  <span className="rating-stars" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((starIndex) => {
      const fill = Math.max(0, Math.min(1, (score / maxScore) * 5 - starIndex));

      return (
        <span key={starIndex} data-rating-part="star">
          <OutlineStarIcon data-rating-part="outline" />
          {fill > 0 && (
            <span data-rating-part="fill" style={{ width: `${fill * 100}%` }}>
              <SolidStarIcon />
            </span>
          )}
        </span>
      );
    })}
  </span>
);

type CompactRatingSelectProps = {
  label: string;
  value: string;
  options: RatingOption[];
  onChange: (value: string) => void;
  maxScore?: 5 | 10;
  showScoreValue?: boolean;
  className?: string;
  defaultValue?: string;
};

export const CompactRatingSelect = ({
  label,
  value,
  options,
  onChange,
  maxScore = 10,
  showScoreValue = false,
  className = '',
  defaultValue,
}: CompactRatingSelectProps) => {
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const selectedHasScore = selected.score !== undefined;
  const isActive = value !== (defaultValue ?? options[0]?.value);

  return (
    <Listbox value={selected} onChange={(option) => onChange(option.value)}>
      <div className={`discover-filter-control ${className}`}>
        <span
          className={`discover-filter-control-label ${
            isActive ? 'discover-filter-control-label-active' : ''
          }`}
        >
          {label}
        </span>
        <Listbox.Button
          aria-label={showScoreValue ? `${label}: ${selected.label}` : label}
          className="app-control-shadow-exempt app-filter-select-trigger app-filter-select-trigger-rating"
          onClickCapture={(event) => closeOtherFilterMenus(event.currentTarget)}
        >
          {selectedHasScore ? (
            <>
              <RatingStars score={selected.score ?? 0} maxScore={maxScore} />
              {showScoreValue && (
                <span data-filter-region="value">{selected.label}</span>
              )}
            </>
          ) : (
            <span data-filter-region="value">{selected.label}</span>
          )}
          <ChevronDownIcon
            className="app-filter-select-chevron"
            aria-hidden="true"
          />
        </Listbox.Button>
        <Transition as={Fragment}>
          <Listbox.Options
            anchor="bottom start"
            portal
            modal={false}
            className="app-filter-select-menu app-filter-select-menu-floating"
          >
            {options.map((option) => {
              const hasScore = option.score !== undefined;

              return (
                <Listbox.Option
                  key={option.value}
                  value={option}
                  className={({ active }) =>
                    `app-filter-select-option app-filter-rating-option ${
                      active ? 'app-filter-select-option-active' : ''
                    }`
                  }
                >
                  {({ selected: optionSelected }) => (
                    <>
                      {optionSelected && (
                        <CheckIcon
                          className="app-filter-select-check"
                          aria-hidden="true"
                        />
                      )}
                      {hasScore ? (
                        <>
                          <RatingStars
                            score={option.score ?? 0}
                            maxScore={maxScore}
                          />
                          {showScoreValue && <span>{option.label}</span>}
                        </>
                      ) : (
                        <span>{option.label}</span>
                      )}
                    </>
                  )}
                </Listbox.Option>
              );
            })}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
};
