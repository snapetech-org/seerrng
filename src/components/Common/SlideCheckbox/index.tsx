import {
  forwardRef,
  memo,
  useCallback,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';

type SlideCheckboxProps = Omit<HTMLAttributes<HTMLSpanElement>, 'onClick'> & {
  onClick: () => void;
  checked?: boolean;
};

const SlideCheckbox = memo(
  forwardRef<HTMLSpanElement, SlideCheckboxProps>(
    ({ onClick, onKeyDown, checked = false, className, ...spanProps }, ref) => {
      const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLSpanElement>) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
        [onClick, onKeyDown]
      );

      return (
        <span
          {...spanProps}
          ref={ref}
          role="checkbox"
          tabIndex={0}
          aria-checked={checked}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          className={[
            'relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span
            aria-hidden="true"
            className={`${
              checked ? 'bg-indigo-500' : 'bg-gray-700'
            } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
          />
          <span
            aria-hidden="true"
            className={`${
              checked ? 'translate-x-5' : 'translate-x-0'
            } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
          />
        </span>
      );
    }
  )
);

SlideCheckbox.displayName = 'SlideCheckbox';

export default SlideCheckbox;
