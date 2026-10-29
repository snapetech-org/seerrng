import Alert from '@app/components/Common/Alert';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SettingsField from '@app/components/Settings/SettingsField';
import SettingsFormRow from '@app/components/Settings/SettingsFormRow';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  DEFAULT_AGE_GATE_SETTINGS,
  MOVIE_CERTIFICATIONS,
  TV_CERTIFICATIONS,
} from '@server/constants/ageGate';
import type { MediaCategoryKey } from '@server/constants/mediaCategories';
import { DEFAULT_ENABLED_MEDIA_CATEGORIES } from '@server/constants/mediaCategories';
import type { MainSettings } from '@server/lib/settings';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.Settings.SettingsCategories', {
  title: 'Media Categories',
  description:
    'Choose which categories everyone can browse and request. Disabled categories disappear from navigation and discovery, and new requests are blocked. Existing requests and download history stay available in Request Status.',
  groupTitle: 'Available Categories',
  groupDescription:
    'These switches control category availability across SeerrNG.',
  movie: 'Movies',
  tv: 'Series',
  music: 'Music',
  ebook: 'Books',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  adult: 'Adult',
  retro: 'Emulation (Retro)',
  modern: 'Emulation (Modern)',
  game: 'PC Games',
  movieDescription: 'Allow movie discovery and requests.',
  tvDescription: 'Allow series discovery and requests.',
  musicDescription: 'Allow music discovery and requests.',
  ebookDescription: 'Allow book discovery and requests.',
  audiobookDescription: 'Allow audiobook discovery and requests.',
  comicDescription: 'Allow comic discovery and requests.',
  magazineDescription: 'Allow magazine discovery and requests.',
  adultDescription:
    'Allow adult-scene discovery and requests. Requires a configured Whisparr v3 service and adult-specific user permission.',
  retroDescription: 'Allow retro ROM discovery and requests.',
  modernDescription: 'Allow modern emulation ROM discovery and requests.',
  gameDescription: 'Allow PC game discovery and requests.',
  adultWarningTitle: 'Adult content is visible to everyone with access',
  adultWarning:
    'If you share this instance with family or expose it through a reverse proxy, anyone granted Request Adult can see what you browse and request. Flag family accounts as restricted below, or under each user’s Permissions, so they never see Adult content.',
  ageGateTitle: 'Age Gate',
  ageGateDescription:
    'Restricted accounts cannot see or request Adult content, and mature movies, series, music, books, comics, and tagged titles are hidden server-side. Filtering uses provider ratings and tags and is best-effort for titles without metadata.',
  ageGateDefault: 'Restrict accounts by default',
  ageGateDefaultDescription:
    'Accounts without an explicit setting are restricted. Administrators are exempt.',
  ageGateMovieMax: 'Highest movie rating',
  ageGateMovieMaxDescription:
    'Restricted accounts cannot see movies rated above this.',
  ageGateTvMax: 'Highest series rating',
  ageGateTvMaxDescription:
    'Restricted accounts cannot see series rated above this.',
  ageGateCountry: 'Rating country',
  ageGateCountryDescription:
    'Two-letter country code whose ratings are used, for example US.',
  saveSuccess: 'Category settings saved.',
  saveFailure: 'Category settings could not be saved.',
});

const categories: {
  key: MediaCategoryKey;
  label: keyof typeof messages;
  description: keyof typeof messages;
}[] = [
  { key: 'movie', label: 'movie', description: 'movieDescription' },
  { key: 'tv', label: 'tv', description: 'tvDescription' },
  { key: 'music', label: 'music', description: 'musicDescription' },
  { key: 'ebook', label: 'ebook', description: 'ebookDescription' },
  {
    key: 'audiobook',
    label: 'audiobook',
    description: 'audiobookDescription',
  },
  { key: 'comic', label: 'comic', description: 'comicDescription' },
  { key: 'magazine', label: 'magazine', description: 'magazineDescription' },
  { key: 'adult', label: 'adult', description: 'adultDescription' },
  { key: 'retro', label: 'retro', description: 'retroDescription' },
  { key: 'modern', label: 'modern', description: 'modernDescription' },
  { key: 'game', label: 'game', description: 'gameDescription' },
];

const SettingsCategories = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<MainSettings>('/api/v1/settings/main');

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.title),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.title)}</h3>
        <p className="description">
          {intl.formatMessage(messages.description)}
        </p>
      </div>
      <Formik
        initialValues={{
          enabledMediaCategories: {
            ...DEFAULT_ENABLED_MEDIA_CATEGORIES,
            ...data?.enabledMediaCategories,
          },
          ageGate: {
            ...DEFAULT_AGE_GATE_SETTINGS,
            ...data?.ageGate,
          },
        }}
        enableReinitialize
        onSubmit={async (values, { setSubmitting }) => {
          try {
            await axios.post('/api/v1/settings/main', {
              enabledMediaCategories: values.enabledMediaCategories,
              ageGate: values.ageGate,
            });
            await Promise.all([
              revalidate(),
              mutate('/api/v1/settings/public'),
            ]);
            addToast(intl.formatMessage(messages.saveSuccess), {
              autoDismiss: true,
              appearance: 'success',
            });
          } catch {
            addToast(intl.formatMessage(messages.saveFailure), {
              autoDismiss: true,
              appearance: 'error',
            });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ isSubmitting, values }) => (
          <Form
            className="settings-page-form"
            data-testid="settings-categories-form"
          >
            <section className="settings-group-card">
              <h3 className="settings-group-heading">
                {intl.formatMessage(messages.groupTitle)}
              </h3>
              <p className="settings-group-description">
                {intl.formatMessage(messages.groupDescription)}
              </p>
              <div className="settings-group-content">
                {categories.map(({ key, label, description }) => (
                  <SettingsFormRow
                    key={key}
                    htmlFor={`enabledMediaCategories.${key}`}
                    label={intl.formatMessage(messages[label])}
                    description={intl.formatMessage(messages[description])}
                    labelClassName="checkbox-label"
                    className="settings-form-row-compact-description"
                  >
                    <SettingsField
                      type="checkbox"
                      id={`enabledMediaCategories.${key}`}
                      name={`enabledMediaCategories.${key}`}
                      data-testid={`category-toggle-${key}`}
                    />
                  </SettingsFormRow>
                ))}
              </div>
              {values.enabledMediaCategories.adult && (
                <Alert title={intl.formatMessage(messages.adultWarningTitle)}>
                  {intl.formatMessage(messages.adultWarning)}
                </Alert>
              )}
            </section>
            <section className="settings-group-card">
              <h3 className="settings-group-heading">
                {intl.formatMessage(messages.ageGateTitle)}
              </h3>
              <p className="settings-group-description">
                {intl.formatMessage(messages.ageGateDescription)}
              </p>
              <div className="settings-group-content">
                <SettingsFormRow
                  htmlFor="ageGate.defaultRestricted"
                  label={intl.formatMessage(messages.ageGateDefault)}
                  description={intl.formatMessage(
                    messages.ageGateDefaultDescription
                  )}
                  labelClassName="checkbox-label"
                  className="settings-form-row-compact-description"
                >
                  <SettingsField
                    type="checkbox"
                    id="ageGate.defaultRestricted"
                    name="ageGate.defaultRestricted"
                    data-testid="age-gate-default"
                  />
                </SettingsFormRow>
                <SettingsFormRow
                  htmlFor="ageGate.maxMovieCertification"
                  label={intl.formatMessage(messages.ageGateMovieMax)}
                  description={intl.formatMessage(
                    messages.ageGateMovieMaxDescription
                  )}
                >
                  <SettingsField
                    as="select"
                    id="ageGate.maxMovieCertification"
                    name="ageGate.maxMovieCertification"
                  >
                    {MOVIE_CERTIFICATIONS.map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </SettingsField>
                </SettingsFormRow>
                <SettingsFormRow
                  htmlFor="ageGate.maxTvCertification"
                  label={intl.formatMessage(messages.ageGateTvMax)}
                  description={intl.formatMessage(
                    messages.ageGateTvMaxDescription
                  )}
                >
                  <SettingsField
                    as="select"
                    id="ageGate.maxTvCertification"
                    name="ageGate.maxTvCertification"
                  >
                    {TV_CERTIFICATIONS.map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </SettingsField>
                </SettingsFormRow>
                <SettingsFormRow
                  htmlFor="ageGate.certificationCountry"
                  label={intl.formatMessage(messages.ageGateCountry)}
                  description={intl.formatMessage(
                    messages.ageGateCountryDescription
                  )}
                >
                  <SettingsField
                    id="ageGate.certificationCountry"
                    name="ageGate.certificationCountry"
                    type="text"
                    maxLength={2}
                  />
                </SettingsFormRow>
              </div>
            </section>
            <div className="actions">
              <div className="flex justify-end">
                <span className="ms-3 inline-flex rounded-md shadow-sm">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="sr-only"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {intl.formatMessage(globalMessages.save)}
                  </button>
                </span>
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </>
  );
};

export default SettingsCategories;
