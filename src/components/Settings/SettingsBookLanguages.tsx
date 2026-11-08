import Button from '@app/components/Common/Button';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import SettingsLoadState from '@app/components/Settings/SettingsLoadState';
import { notifySettingsUserChange } from '@app/components/Settings/settingsEvents';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.BookLanguages', {
  title: 'Book language restrictions',
  label: 'Allowed book languages',
  help: 'Leave empty to allow all languages. Otherwise enter comma-separated three-letter codes, such as eng for English, fre for French or ger for German. Search and discovery show matching books. Requests require a destination-verified edition in an allowed language; unknown languages and destinations without edition verification are blocked. Choose ebook or audiobook separately.',
  invalid: 'Enter up to 50 comma-separated three-letter language codes.',
  saved: 'Book language restrictions saved',
  failed:
    'Could not save book language restrictions. Your changes are still here; try again.',
});
const url = '/api/v1/settings/metadatas/books';
export default function SettingsBookLanguages() {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data, error, mutate } = useSWR<{ allowedLanguages: string[] }>(url);
  return (
    <section className="app-card-sub settings-group-card">
      <h3 className="heading">{intl.formatMessage(messages.title)}</h3>
      {!data ? (
        <SettingsLoadState failed={!!error} onRetry={() => mutate()} />
      ) : (
        <Formik
          initialValues={{ languages: data.allowedLanguages.join(', ') }}
          validate={({ languages }) =>
            languages.trim() &&
            (languages.split(',').length > 50 ||
              languages
                .split(',')
                .some((code) => !/^\s*[a-zA-Z]{3}\s*$/.test(code)))
              ? { languages: intl.formatMessage(messages.invalid) }
              : {}
          }
          onSubmit={async (values, { resetForm, setStatus }) => {
            setStatus(undefined);
            try {
              const saved = await axios.put<{ allowedLanguages: string[] }>(
                url,
                {
                  allowedLanguages: values.languages.trim()
                    ? values.languages
                        .split(',')
                        .map((code) => code.trim().toLowerCase())
                    : [],
                }
              );
              resetForm({
                values: { languages: saved.data.allowedLanguages.join(', ') },
              });
              await mutate(saved.data, false);
              addToast(intl.formatMessage(messages.saved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch {
              setStatus(intl.formatMessage(messages.failed));
            }
          }}
        >
          {({ dirty, isSubmitting, errors, touched, status }) => (
            <Form
              data-testid="book-language-settings-form"
              data-settings-dirty={dirty}
              data-settings-submitting={isSubmitting}
              onChange={notifySettingsUserChange}
            >
              <div className="form-row">
                <label htmlFor="allowed-book-languages">
                  {intl.formatMessage(messages.label)}
                </label>
                <div className="form-input-area">
                  <Field
                    id="allowed-book-languages"
                    name="languages"
                    type="text"
                    disabled={isSubmitting}
                    aria-invalid={!!(touched.languages && errors.languages)}
                    aria-describedby="allowed-book-languages-help"
                  />
                  <SettingsHelp
                    id="allowed-book-languages-help"
                    className="settings-form-row-description"
                  >
                    {intl.formatMessage(messages.help)}
                  </SettingsHelp>
                  {touched.languages && errors.languages && (
                    <p className="settings-form-row-description" role="alert">
                      {errors.languages}
                    </p>
                  )}
                  {status && (
                    <p className="settings-form-row-description" role="alert">
                      {status}
                    </p>
                  )}
                </div>
              </div>
              <div className="actions settings-metadata-actions">
                <Button
                  buttonType="primary"
                  type="submit"
                  disabled={!dirty || isSubmitting}
                >
                  {intl.formatMessage(
                    isSubmitting ? globalMessages.saving : globalMessages.save
                  )}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      )}
    </section>
  );
}
