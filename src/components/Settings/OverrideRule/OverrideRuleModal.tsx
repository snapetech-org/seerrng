import Modal from '@app/components/Common/Modal';
import LanguageSelector from '@app/components/LanguageSelector';
import {
  GenreSelector,
  KeywordSelector,
  UserSelector,
} from '@app/components/Selector';
import type { DVRTestResponse } from '@app/components/Settings/SettingsServices';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type OverrideRule from '@server/entity/OverrideRule';
import type {
  LidarrSettings,
  RadarrSettings,
  ReadarrSettings,
  Region,
  SonarrSettings,
} from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import Select from 'react-select';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.OverrideRuleModal', {
  createrule: 'New Override Rule',
  editrule: 'Edit Override Rule',
  create: 'Create rule',
  service: 'Service',
  serviceDescription: 'Apply this rule to the selected service.',
  selectService: 'Select service',
  conditions: 'Conditions',
  conditionsDescription:
    'Specifies conditions before applying parameter changes. Each field must be validated for the rules to be applied (AND operation). A field is considered verified if any of its properties match (OR operation).',
  catalogConditionsDescription:
    'Enter comma-separated genre or keyword names as shown on the album or book. If that metadata is missing, the rule will not match and normal request defaults remain in place.',
  settings: 'Settings',
  settingsDescription:
    'Specifies which settings will be changed when the above conditions are met.',
  users: 'Users',
  genres: 'Genres',
  languages: 'Languages',
  keywords: 'Keywords',
  productionCountries: 'Production Countries',
  productionCountriesDescription:
    'Matches when any selected country appears in the title’s production-country metadata. Titles without that metadata do not match. You can select up to 100 countries.',
  selectCountries: 'Select Countries',
  noCountryOptions: 'No Countries Available',
  catalogGenrePlaceholder: 'Comma-separated album genres or book subjects',
  catalogKeywordPlaceholder: 'Comma-separated album tags or book subjects',
  rootfolder: 'Root Folder',
  selectRootFolder: 'Select root folder',
  qualityprofile: 'Quality Profile',
  selectQualityProfile: 'Select quality profile',
  tags: 'Tags',
  notagoptions: 'No tags',
  selecttags: 'Select tags',
  ruleCreated: 'Override rule created successfully!',
  ruleUpdated: 'Override rule updated successfully!',
});

type OptionType = {
  value: number;
  label: string;
};

type CountryOption = {
  value: string;
  label: string;
};

interface OverrideRuleModalProps {
  rule: OverrideRule | null;
  onClose: () => void;
  radarrServices: RadarrSettings[];
  sonarrServices: SonarrSettings[];
  lidarrServices: LidarrSettings[];
  readarrServices: ReadarrSettings[];
}

const OverrideRuleModal = ({
  onClose,
  rule,
  radarrServices,
  sonarrServices,
  lidarrServices,
  readarrServices,
}: OverrideRuleModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { data: regions } = useSWR<Region[]>('/api/v1/regions');
  const productionCountryOptions = useMemo(
    () =>
      (regions ?? [])
        .map((region) => ({
          value: region.iso_3166_1,
          label:
            intl.formatDisplayName(region.iso_3166_1, {
              type: 'region',
              fallback: 'none',
            }) ?? region.english_name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [intl, regions]
  );
  const [isValidated, setIsValidated] = useState(rule ? true : false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<DVRTestResponse>({
    profiles: [],
    rootFolders: [],
    tags: [],
  });

  const getServiceInfos = useCallback(
    async (
      {
        id,
        hostname,
        port,
        apiKey,
        baseUrl,
        useSsl = false,
        serviceType,
      }: {
        id: number;
        hostname: string;
        port: number;
        apiKey: string;
        baseUrl?: string;
        useSsl?: boolean;
        serviceType?: ReadarrSettings['serviceType'];
      },
      type: 'radarr' | 'sonarr' | 'lidarr' | 'readarr'
    ) => {
      setIsTesting(true);
      try {
        const response = await axios.post<DVRTestResponse>(
          `/api/v1/settings/${type}/test`,
          {
            id,
            hostname,
            apiKey,
            port: Number(port),
            baseUrl,
            useSsl,
            serviceType,
          }
        );

        setIsValidated(true);
        setTestResponse(response.data);
      } catch {
        setIsValidated(false);
      } finally {
        setIsTesting(false);
      }
    },
    []
  );

  useEffect(() => {
    const radarrMatch = radarrServices.find(
      (s) => s.id === rule?.radarrServiceId
    );
    if (radarrMatch) getServiceInfos(radarrMatch, 'radarr');

    const sonarrMatch = sonarrServices.find(
      (s) => s.id === rule?.sonarrServiceId
    );
    if (sonarrMatch) getServiceInfos(sonarrMatch, 'sonarr');

    const lidarrMatch = lidarrServices.find(
      (s) => s.id === rule?.lidarrServiceId
    );
    if (lidarrMatch) getServiceInfos(lidarrMatch, 'lidarr');
    const readarrMatch = readarrServices.find(
      (s) => s.id === rule?.readarrServiceId
    );
    if (readarrMatch) getServiceInfos(readarrMatch, 'readarr');
    if (rule && !radarrMatch && !sonarrMatch && !lidarrMatch && !readarrMatch) {
      setIsValidated(false);
    }
  }, [
    getServiceInfos,
    lidarrServices,
    readarrServices,
    rule,
    radarrServices,
    sonarrServices,
  ]);

  return (
    <Transition as="div" appear show>
      <Formik
        initialValues={{
          radarrServiceId: rule?.radarrServiceId,
          sonarrServiceId: rule?.sonarrServiceId,
          lidarrServiceId: rule?.lidarrServiceId,
          readarrServiceId: rule?.readarrServiceId,
          users: rule?.users,
          genre: rule?.genre,
          language: rule?.language,
          keywords: rule?.keywords,
          productionCountries: rule?.productionCountries,
          profileId: rule?.profileId,
          rootFolder: rule?.rootFolder,
          tags: rule?.tags,
        }}
        onSubmit={async (values) => {
          try {
            const submission = {
              users: values.users || null,
              genre: values.genre || null,
              language:
                values.lidarrServiceId != null ? null : values.language || null,
              keywords: values.keywords || null,
              productionCountries:
                values.lidarrServiceId != null ||
                values.readarrServiceId != null
                  ? null
                  : values.productionCountries || null,
              profileId:
                values.profileId == null || String(values.profileId) === ''
                  ? null
                  : Number(values.profileId),
              rootFolder: values.rootFolder || null,
              tags: values.tags || null,
              radarrServiceId: values.radarrServiceId,
              sonarrServiceId: values.sonarrServiceId,
              lidarrServiceId: values.lidarrServiceId,
              readarrServiceId: values.readarrServiceId,
            };
            if (!rule) {
              await axios.post('/api/v1/overrideRule', submission);
              addToast(intl.formatMessage(messages.ruleCreated), {
                appearance: 'success',
                autoDismiss: true,
              });
            } else {
              await axios.put(`/api/v1/overrideRule/${rule.id}`, submission);
              addToast(intl.formatMessage(messages.ruleUpdated), {
                appearance: 'success',
                autoDismiss: true,
              });
            }
            onClose();
          } catch {
            // set error here
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          handleSubmit,
          setFieldValue,
          isSubmitting,
          isValid,
        }) => {
          return (
            <Modal
              onCancel={onClose}
              okButtonType="primary"
              okText={
                isSubmitting
                  ? intl.formatMessage(globalMessages.saving)
                  : rule
                    ? intl.formatMessage(globalMessages.save)
                    : intl.formatMessage(messages.create)
              }
              okDisabled={
                isSubmitting ||
                !isValid ||
                (!values.users &&
                  !values.genre &&
                  !values.language &&
                  !values.keywords &&
                  !values.productionCountries) ||
                (!values.rootFolder &&
                  String(values.profileId ?? '') === '' &&
                  !values.tags)
              }
              onOk={() => handleSubmit()}
              title={
                !rule
                  ? intl.formatMessage(messages.createrule)
                  : intl.formatMessage(messages.editrule)
              }
            >
              <div className="mb-6">
                <h3 className="text-lg leading-8 font-bold text-gray-100">
                  {intl.formatMessage(messages.service)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.serviceDescription)}
                </p>
                <div className="form-row">
                  <label htmlFor="service" className="text-label">
                    {intl.formatMessage(messages.service)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <select
                        id="service"
                        name="service"
                        defaultValue={
                          values.radarrServiceId != null
                            ? `radarr-${values.radarrServiceId}`
                            : values.sonarrServiceId != null
                              ? `sonarr-${values.sonarrServiceId}`
                              : values.lidarrServiceId != null
                                ? `lidarr-${values.lidarrServiceId}`
                                : values.readarrServiceId != null
                                  ? `readarr-${values.readarrServiceId}`
                                  : ''
                        }
                        onChange={(e) => {
                          const id = Number(e.target.value.split('-')[1]);
                          if (e.target.value.startsWith('radarr-')) {
                            setFieldValue('radarrServiceId', id);
                            setFieldValue('sonarrServiceId', null);
                            setFieldValue('lidarrServiceId', null);
                            setFieldValue('readarrServiceId', null);
                            const match = radarrServices.find(
                              (s) => s.id === id
                            );
                            if (match) {
                              getServiceInfos(match, 'radarr');
                            }
                          } else if (e.target.value.startsWith('sonarr-')) {
                            setFieldValue('radarrServiceId', null);
                            setFieldValue('sonarrServiceId', id);
                            setFieldValue('lidarrServiceId', null);
                            setFieldValue('readarrServiceId', null);
                            const match = sonarrServices.find(
                              (s) => s.id === id
                            );
                            if (match) {
                              getServiceInfos(match, 'sonarr');
                            }
                          } else if (e.target.value.startsWith('lidarr-')) {
                            setFieldValue('radarrServiceId', null);
                            setFieldValue('sonarrServiceId', null);
                            setFieldValue('lidarrServiceId', id);
                            setFieldValue('readarrServiceId', null);
                            setFieldValue('genre', null);
                            setFieldValue('language', null);
                            setFieldValue('keywords', null);
                            setFieldValue('productionCountries', null);
                            const match = lidarrServices.find(
                              (s) => s.id === id
                            );
                            if (match) {
                              getServiceInfos(match, 'lidarr');
                            }
                          } else if (e.target.value.startsWith('readarr-')) {
                            setFieldValue('radarrServiceId', null);
                            setFieldValue('sonarrServiceId', null);
                            setFieldValue('lidarrServiceId', null);
                            setFieldValue('readarrServiceId', id);
                            setFieldValue('productionCountries', null);
                            const match = readarrServices.find(
                              (s) => s.id === id
                            );
                            if (match) {
                              getServiceInfos(match, 'readarr');
                            }
                          } else {
                            setFieldValue('radarrServiceId', null);
                            setFieldValue('sonarrServiceId', null);
                            setFieldValue('lidarrServiceId', null);
                            setFieldValue('readarrServiceId', null);
                            setIsValidated(false);
                          }
                        }}
                      >
                        <option value="">
                          {intl.formatMessage(messages.selectService)}
                        </option>
                        {radarrServices.map((radarr) => (
                          <option
                            key={`radarr-${radarr.id}`}
                            value={`radarr-${radarr.id}`}
                          >
                            {radarr.name}
                          </option>
                        ))}
                        {sonarrServices.map((sonarr) => (
                          <option
                            key={`sonarr-${sonarr.id}`}
                            value={`sonarr-${sonarr.id}`}
                          >
                            {sonarr.name}
                          </option>
                        ))}
                        {lidarrServices.map((lidarr) => (
                          <option
                            key={`lidarr-${lidarr.id}`}
                            value={`lidarr-${lidarr.id}`}
                          >
                            {lidarr.name}
                          </option>
                        ))}
                        {readarrServices.map((readarr) => (
                          <option
                            key={`readarr-${readarr.id}`}
                            value={`readarr-${readarr.id}`}
                          >
                            {readarr.name} (
                            {readarr.serviceType === 'both'
                              ? 'Book + Audiobook'
                              : readarr.serviceType === 'audiobook'
                                ? 'Audiobook'
                                : 'Book'}
                            )
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.rootFolder &&
                      touched.rootFolder &&
                      typeof errors.rootFolder === 'string' && (
                        <div className="error">{errors.rootFolder}</div>
                      )}
                  </div>
                </div>
                <h3 className="text-lg leading-8 font-bold text-gray-100">
                  {intl.formatMessage(messages.conditions)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.conditionsDescription)}
                </p>
                {(values.lidarrServiceId != null ||
                  values.readarrServiceId != null) && (
                  <p className="description">
                    {intl.formatMessage(messages.catalogConditionsDescription)}
                  </p>
                )}
                <div className="form-row">
                  <label htmlFor="users" className="text-label">
                    {intl.formatMessage(messages.users)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <UserSelector
                        defaultValue={values.users}
                        isDisabled={!isValidated || isTesting}
                        isMulti
                        onChange={(users) => {
                          setFieldValue(
                            'users',
                            users?.map((v) => v.value).join(',')
                          );
                        }}
                      />
                    </div>
                    {errors.users &&
                      touched.users &&
                      typeof errors.users === 'string' && (
                        <div className="error">{errors.users}</div>
                      )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="genre" className="text-label">
                    {intl.formatMessage(messages.genres)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      {values.lidarrServiceId != null ||
                      values.readarrServiceId != null ? (
                        <Field
                          type="text"
                          id="genre"
                          name="genre"
                          placeholder={intl.formatMessage(
                            messages.catalogGenrePlaceholder
                          )}
                          disabled={!isValidated || isTesting}
                        />
                      ) : (
                        <GenreSelector
                          type={
                            values.radarrServiceId != null
                              ? 'movie'
                              : values.sonarrServiceId != null
                                ? 'tv'
                                : 'tv'
                          }
                          defaultValue={values.genre}
                          isMulti
                          isDisabled={!isValidated || isTesting}
                          onChange={(genres) => {
                            setFieldValue(
                              'genre',
                              genres?.map((v) => v.value).join(',')
                            );
                          }}
                        />
                      )}
                    </div>
                    {errors.genre &&
                      touched.genre &&
                      typeof errors.genre === 'string' && (
                        <div className="error">{errors.genre}</div>
                      )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="language" className="text-label">
                    {intl.formatMessage(messages.languages)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <LanguageSelector
                        value={values.language}
                        serverValue={currentSettings.originalLanguage}
                        setFieldValue={(_key, value) => {
                          setFieldValue('language', value);
                        }}
                        isDisabled={
                          !isValidated ||
                          isTesting ||
                          values.lidarrServiceId != null
                        }
                      />
                    </div>
                    {errors.language &&
                      touched.language &&
                      typeof errors.language === 'string' && (
                        <div className="error">{errors.language}</div>
                      )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="keywords" className="text-label">
                    {intl.formatMessage(messages.keywords)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      {values.lidarrServiceId != null ||
                      values.readarrServiceId != null ? (
                        <Field
                          type="text"
                          id="keywords"
                          name="keywords"
                          placeholder={intl.formatMessage(
                            messages.catalogKeywordPlaceholder
                          )}
                          disabled={!isValidated || isTesting}
                        />
                      ) : (
                        <KeywordSelector
                          defaultValue={values.keywords}
                          isMulti
                          isDisabled={!isValidated || isTesting}
                          onChange={(value) => {
                            setFieldValue(
                              'keywords',
                              value?.map((v) => v.value).join(',')
                            );
                          }}
                        />
                      )}
                    </div>
                    {errors.keywords &&
                      touched.keywords &&
                      typeof errors.keywords === 'string' && (
                        <div className="error">{errors.keywords}</div>
                      )}
                  </div>
                </div>
                {(values.radarrServiceId != null ||
                  values.sonarrServiceId != null) && (
                  <div className="form-row">
                    <label htmlFor="productionCountries" className="text-label">
                      {intl.formatMessage(messages.productionCountries)}
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Select<CountryOption, true>
                          inputId="productionCountries"
                          options={productionCountryOptions}
                          isMulti
                          isDisabled={!isValidated || isTesting}
                          placeholder={intl.formatMessage(
                            messages.selectCountries
                          )}
                          className="react-select-container"
                          classNamePrefix="react-select"
                          value={(values.productionCountries ?? '')
                            .split('|')
                            .filter(Boolean)
                            .map((rawCountryCode) => {
                              const countryCode = rawCountryCode.toUpperCase();
                              return (
                                productionCountryOptions.find(
                                  (option) => option.value === countryCode
                                ) ?? {
                                  value: countryCode,
                                  label: countryCode,
                                }
                              );
                            })}
                          isOptionDisabled={(option) => {
                            const selectedCountryCodes = (
                              values.productionCountries ?? ''
                            )
                              .split('|')
                              .filter(Boolean);
                            return (
                              selectedCountryCodes.length >= 100 &&
                              !selectedCountryCodes.includes(option.value)
                            );
                          }}
                          onChange={(selectedCountries) => {
                            setFieldValue(
                              'productionCountries',
                              selectedCountries
                                .map((country) => country.value)
                                .join('|')
                            );
                          }}
                          noOptionsMessage={() =>
                            intl.formatMessage(messages.noCountryOptions)
                          }
                        />
                      </div>
                      <p className="description">
                        {intl.formatMessage(
                          messages.productionCountriesDescription
                        )}
                      </p>
                    </div>
                  </div>
                )}
                <h3 className="mt-4 text-lg leading-8 font-bold text-gray-100">
                  {intl.formatMessage(messages.settings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.settingsDescription)}
                </p>
                <div className="form-row">
                  <label htmlFor="rootFolderRule" className="text-label">
                    {intl.formatMessage(messages.rootfolder)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        as="select"
                        id="rootFolderRule"
                        name="rootFolder"
                        disabled={!isValidated || isTesting}
                      >
                        <option value="">
                          {intl.formatMessage(messages.selectRootFolder)}
                        </option>
                        {testResponse.rootFolders.length > 0 &&
                          testResponse.rootFolders.map((folder) => (
                            <option
                              key={`loaded-profile-${folder.id}`}
                              value={folder.path}
                            >
                              {folder.path}
                            </option>
                          ))}
                      </Field>
                    </div>
                    {errors.rootFolder &&
                      touched.rootFolder &&
                      typeof errors.rootFolder === 'string' && (
                        <div className="error">{errors.rootFolder}</div>
                      )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="profileIdRule" className="text-label">
                    {intl.formatMessage(messages.qualityprofile)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        as="select"
                        id="profileIdRule"
                        name="profileId"
                        disabled={!isValidated || isTesting}
                      >
                        <option value="">
                          {intl.formatMessage(messages.selectQualityProfile)}
                        </option>
                        {testResponse.profiles.length > 0 &&
                          testResponse.profiles.map((profile) => (
                            <option
                              key={`loaded-profile-${profile.id}`}
                              value={profile.id}
                            >
                              {profile.name}
                            </option>
                          ))}
                      </Field>
                    </div>
                    {errors.profileId &&
                      touched.profileId &&
                      typeof errors.profileId === 'string' && (
                        <div className="error">{errors.profileId}</div>
                      )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="tags" className="text-label">
                    {intl.formatMessage(messages.tags)}
                  </label>
                  <div className="form-input-area">
                    <Select<OptionType, true>
                      options={testResponse.tags.map((tag) => ({
                        label: tag.label,
                        value: tag.id,
                      }))}
                      isMulti
                      isDisabled={!isValidated || isTesting}
                      placeholder={intl.formatMessage(messages.selecttags)}
                      className="react-select-container"
                      classNamePrefix="react-select"
                      value={
                        (values?.tags
                          ?.split(',')
                          .map((tagId) => {
                            const foundTag = testResponse.tags.find(
                              (tag) => tag.id === Number(tagId)
                            );

                            if (!foundTag) {
                              return undefined;
                            }

                            return {
                              value: foundTag.id,
                              label: foundTag.label,
                            };
                          })
                          .filter(
                            (option) => option !== undefined
                          ) as OptionType[]) || []
                      }
                      onChange={(value) => {
                        setFieldValue(
                          'tags',
                          value.map((option) => option.value).join(',')
                        );
                      }}
                      noOptionsMessage={() =>
                        intl.formatMessage(messages.notagoptions)
                      }
                    />
                  </div>
                </div>
              </div>
            </Modal>
          );
        }}
      </Formik>
    </Transition>
  );
};

export default OverrideRuleModal;
