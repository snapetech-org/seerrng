import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/solid';
import { Field } from 'formik';
import { memo, useCallback, useMemo, useState } from 'react';

interface CustomInputProps extends React.ComponentProps<'input'> {
  as?: 'input';
}

interface CustomFieldProps extends React.ComponentProps<typeof Field> {
  as?: 'field';
}

type SensitiveInputProps = CustomInputProps | CustomFieldProps;

const SensitiveInput = memo(
  ({ as = 'input', ...props }: SensitiveInputProps) => {
    const [isHidden, setHidden] = useState(true);
    const Component = as === 'input' ? 'input' : Field;
    const componentProps = useMemo(
      () =>
        as === 'input'
          ? props
          : {
              ...props,
              as: props.type === 'textarea' ? 'textarea' : undefined,
            },
      [as, props]
    );
    const handleToggleVisibility = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setHidden((current) => !current);
      },
      []
    );

    return (
      <>
        <Component
          autoComplete="off"
          data-form-type="other"
          data-1pignore="true"
          data-lpignore="true"
          {...componentProps}
          className={`rounded-s-only ${componentProps.className ?? ''}`}
          type={
            props.type === 'textarea'
              ? undefined
              : isHidden
                ? 'password'
                : props.type !== 'password'
                  ? (props.type ?? 'text')
                  : 'text'
          }
          style={
            props.type === 'textarea' && isHidden
              ? { WebkitTextSecurity: 'disc', ...props.style }
              : props.style
          }
        />
        <button
          onClick={handleToggleVisibility}
          type="button"
          className="input-action"
          aria-label={
            isHidden ? 'Show sensitive value' : 'Hide sensitive value'
          }
        >
          {isHidden ? <EyeSlashIcon /> : <EyeIcon />}
        </button>
      </>
    );
  }
);

SensitiveInput.displayName = 'SensitiveInput';

export default SensitiveInput;
