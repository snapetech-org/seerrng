import Button from '@app/components/Common/Button';
import {
  settingsDisplayMessages,
  useSettingsDisplay,
} from '@app/components/Settings/SettingsDisplay';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import { getIn, useFormikContext } from 'formik';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

type Props = {
  title: ReactNode;
  description?: ReactNode;
  configured: boolean;
  fields: string[];
  children: ReactNode;
  inline?: boolean;
  className?: string;
};
export default function SettingsGroup({
  title,
  description,
  configured,
  fields,
  children,
  inline = false,
  className = 'app-card-sub settings-group-card',
}: Props) {
  const intl = useIntl();
  const { compact, register } = useSettingsDisplay();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      panel.current ? register(panel.current, () => setOpen(true)) : undefined,
    [compact, register]
  );
  const { errors, submitCount } = useFormikContext();
  const [open, setOpen] = useState(!configured);
  const id = useId();
  useEffect(() => setOpen(!configured), [configured]);
  useEffect(() => {
    if (submitCount && fields.some((field) => getIn(errors, field)))
      setOpen(true);
  }, [errors, submitCount, fields]);
  if (!compact && inline) return <>{children}</>;
  return (
    <section
      className={className}
      data-settings-group="true"
      data-configured={configured}
      onInvalidCapture={(event) => {
        setOpen(true);
        const control = event.target;
        if (control instanceof HTMLElement)
          window.requestAnimationFrame(() => control.focus());
      }}
    >
      <h3
        className={`settings-group-heading ${compact ? 'settings-group-title-row' : ''}`}
      >
        {compact ? (
          <Button
            type="button"
            buttonSize="standard"
            className="settings-group-toggle"
            aria-expanded={open}
            aria-controls={id}
            aria-describedby={`${id}-status`}
            onClick={() => setOpen((value) => !value)}
          >
            <span>{title}</span>
          </Button>
        ) : (
          title
        )}
        {compact && (
          <span className="settings-group-status" id={`${id}-status`}>
            {intl.formatMessage(
              configured
                ? settingsDisplayMessages.configured
                : settingsDisplayMessages.optional
            )}
          </span>
        )}
      </h3>
      {description && (
        <SettingsHelp className="settings-group-description">
          {description}
        </SettingsHelp>
      )}
      <div
        ref={panel}
        id={id}
        className="settings-group-content"
        hidden={compact && !open}
        onFocusCapture={() => setOpen(true)}
      >
        {children}
      </div>
    </section>
  );
}
