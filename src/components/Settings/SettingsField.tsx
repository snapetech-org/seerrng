import SelectionCircle from '@app/components/Common/SelectionCircle';
import { notifySettingsUserChange } from '@app/components/Settings/settingsEvents';
import {
  Field as FormikField,
  useField,
  type FieldAttributes,
  type FieldConfig,
  type GenericFieldHTMLAttributes,
} from 'formik';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ChangeEventHandler,
  type FocusEventHandler,
} from 'react';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type SettingsFieldProps = DistributiveOmit<
  GenericFieldHTMLAttributes,
  'name' | 'type' | 'id' | 'disabled' | 'checked' | 'onBlur' | 'onChange'
> &
  Omit<FieldConfig<unknown>, 'name' | 'type'> & {
    name: string;
    type?: string;
    id?: string;
    disabled?: boolean;
    checked?: boolean;
    label?: string;
    onCheckedChange?: (checked: boolean) => void;
    onBlur?: FocusEventHandler<HTMLElement>;
    onChange?:
      | ChangeEventHandler<HTMLInputElement>
      | ChangeEventHandler<HTMLSelectElement>
      | ChangeEventHandler<HTMLTextAreaElement>;
    'data-testid'?: string;
  };

const ControlledSettingsCheckboxField = forwardRef<
  HTMLButtonElement,
  SettingsFieldProps
>(
  (
    {
      checked,
      id,
      name,
      disabled,
      label,
      onCheckedChange,
      'data-testid': dataTestId,
      ...buttonProps
    },
    ref
  ) => {
    return (
      <SelectionCircle
        {...(buttonProps as ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={ref}
        id={id}
        name={name}
        data-testid={dataTestId}
        label={label}
        selected={checked ?? false}
        disabled={disabled ?? false}
        onClick={() => onCheckedChange?.(!checked)}
      />
    );
  }
);

const FormikSettingsCheckboxField = forwardRef<
  HTMLButtonElement,
  SettingsFieldProps
>(
  (
    {
      id,
      name,
      disabled,
      label,
      'data-testid': dataTestId,
      onChange,
      onBlur,
      ...buttonProps
    },
    ref
  ) => {
    const [field, , helpers] = useField<boolean>({ name, type: 'checkbox' });

    return (
      <SelectionCircle
        {...(buttonProps as ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={ref}
        id={id}
        name={name}
        data-testid={dataTestId}
        label={label}
        selected={field.value}
        disabled={disabled ?? false}
        onBlur={(event) => {
          void helpers.setTouched(true);
          onBlur?.(event);
        }}
        onClick={() => {
          const checked = !field.value;
          void helpers.setValue(checked);
          notifySettingsUserChange();

          if (typeof onChange === 'function') {
            (onChange as ChangeEventHandler<HTMLInputElement>)({
              target: { checked, name },
              currentTarget: { checked, name },
            } as ChangeEvent<HTMLInputElement>);
          }
        }}
      />
    );
  }
);

const SettingsField = forwardRef<HTMLButtonElement, SettingsFieldProps>(
  (props, ref) =>
    props.type === 'checkbox' ? (
      typeof props.checked === 'boolean' && props.onCheckedChange ? (
        <ControlledSettingsCheckboxField {...props} ref={ref} />
      ) : (
        <FormikSettingsCheckboxField {...props} ref={ref} />
      )
    ) : (
      <FormikField {...(props as unknown as FieldAttributes<unknown>)} />
    )
);

SettingsField.displayName = 'SettingsField';

export default SettingsField;
