import defineMessages from '@app/utils/defineMessages';
import type { SavedConnectionHost } from '@server/lib/settings';
import { getIn, useFormikContext } from 'formik';
import { useRef, type ChangeEvent, type ChangeEventHandler } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const SETTINGS_PATH = '/api/v1/settings/connection-hosts';

const messages = defineMessages('components.Settings.SavedServiceHostPicker', {
  picker: 'Saved hosts',
  useHost: 'Use saved host {name} ({hostname})',
});

export const SavedServiceHostPicker = ({
  onSelect,
  selectedHost,
}: {
  onSelect: (hostname: string) => void;
  selectedHost?: string;
}) => {
  const intl = useIntl();
  const picker = useRef<HTMLDetailsElement>(null);
  const { data } = useSWR<SavedConnectionHost[]>(SETTINGS_PATH, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (!data?.length) return null;

  return (
    <details ref={picker} className="service-host-picker">
      <summary>{intl.formatMessage(messages.picker)}</summary>
      <div
        className="service-host-picker-menu"
        role="group"
        aria-label={intl.formatMessage(messages.picker)}
      >
        {data.map((host) => (
          <button
            key={`${host.name}:${host.hostname}`}
            type="button"
            className={`max-w-full rounded-md border px-2 py-1 text-start text-xs break-all whitespace-normal transition-colors ${
              selectedHost === host.hostname
                ? 'border-indigo-500 bg-indigo-500/20 text-white'
                : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-gray-400 hover:text-white'
            }`}
            aria-label={intl.formatMessage(messages.useHost, {
              name: host.name,
              hostname: host.hostname,
            })}
            aria-pressed={selectedHost === host.hostname}
            onClick={() => {
              onSelect(host.hostname);
              if (picker.current) picker.current.open = false;
            }}
          >
            <span className="font-semibold">{host.name}</span>
            <span className="ms-1 text-gray-400">{host.hostname}</span>
          </button>
        ))}
      </div>
    </details>
  );
};

export const FormikSavedServiceHostPicker = ({
  fieldName,
  onChange,
}: {
  fieldName: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}) => {
  const { values, setFieldValue } = useFormikContext<Record<string, unknown>>();
  const value = getIn(values, fieldName);
  return (
    <SavedServiceHostPicker
      selectedHost={typeof value === 'string' ? value : undefined}
      onSelect={(hostname) => {
        void setFieldValue(fieldName, hostname);
        onChange?.({
          target: { name: fieldName, value: hostname },
          currentTarget: { name: fieldName, value: hostname },
        } as ChangeEvent<HTMLInputElement>);
      }}
    />
  );
};
