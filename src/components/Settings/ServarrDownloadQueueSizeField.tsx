import Field from '@app/components/Settings/SettingsField';
import defineMessages from '@app/utils/defineMessages';
import { useField } from 'formik';
import { useId } from 'react';
import type { IntlShape } from 'react-intl';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

export const DEFAULT_SERVARR_DOWNLOAD_QUEUE_SIZE = 1_000;
export const MIN_SERVARR_DOWNLOAD_QUEUE_SIZE = 10;
export const MAX_SERVARR_DOWNLOAD_QUEUE_SIZE = 10_000;

const messages = defineMessages(
  'components.Settings.ServarrDownloadQueueSizeField',
  {
    label: 'Download Queue Size',
    help: 'Limit how many queue items SeerrNG tracks for this service. Items beyond the limit may appear as earlier downloads leave the tracked range. This does not change how the service handles downloads.',
    required: 'Download Queue Size is required.',
    invalid: 'Enter a whole number from {minimum} to {maximum}.',
  }
);

export const createServarrDownloadQueueSizeSchema = (intl: IntlShape) => {
  const invalidMessage = intl.formatMessage(messages.invalid, {
    minimum: MIN_SERVARR_DOWNLOAD_QUEUE_SIZE,
    maximum: MAX_SERVARR_DOWNLOAD_QUEUE_SIZE,
  });

  return Yup.number()
    .transform((value, originalValue) =>
      originalValue === '' ? undefined : value
    )
    .typeError(invalidMessage)
    .integer(invalidMessage)
    .min(MIN_SERVARR_DOWNLOAD_QUEUE_SIZE, invalidMessage)
    .max(MAX_SERVARR_DOWNLOAD_QUEUE_SIZE, invalidMessage)
    .required(intl.formatMessage(messages.required));
};

const ServarrDownloadQueueSizeField = () => {
  const intl = useIntl();
  const [, meta] = useField('downloadQueueSize');
  const generatedId = useId().replace(/:/g, '');
  const inputId = `${generatedId}-downloadQueueSize`;
  const helpId = `${generatedId}-downloadQueueSizeHelp`;
  const errorDescriptionId = `${generatedId}-downloadQueueSizeError`;
  const hasError = Boolean(meta.touched && meta.error);
  const describedBy = hasError ? `${helpId} ${errorDescriptionId}` : helpId;

  return (
    <div className="form-row">
      <label htmlFor={inputId} className="text-label">
        {intl.formatMessage(messages.label)}
      </label>
      <div className="form-input-area">
        <div className="form-input-field">
          <Field
            id={inputId}
            name="downloadQueueSize"
            type="number"
            min={MIN_SERVARR_DOWNLOAD_QUEUE_SIZE}
            max={MAX_SERVARR_DOWNLOAD_QUEUE_SIZE}
            step={1}
            inputMode="numeric"
            aria-describedby={describedBy}
            aria-invalid={hasError}
          />
        </div>
        {hasError && (
          <div className="error" id={errorDescriptionId}>
            {meta.error}
          </div>
        )}
      </div>
      <span className="settings-form-row-description" id={helpId}>
        {intl.formatMessage(messages.help)}
      </span>
    </div>
  );
};

export default ServarrDownloadQueueSizeField;
