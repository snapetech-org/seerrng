import Button from '@app/components/Common/Button';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  DiscoverSliderType,
  MAX_DISCOVER_COMPANIES,
  type DiscoverCompanyData,
} from '@server/constants/discover';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import {
  isSafeDiscoverCompanyLogoPath,
  parseDiscoverCompanyList,
  readDiscoverCompanyList,
  type DiscoverCompanyKind,
} from '@server/lib/discoverCompanyList';
import type { ProductionCompany, TvNetwork } from '@server/models/common';
import axios from 'axios';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { defaultDiscoverNetworks } from './NetworkSlider';
import { defaultDiscoverStudios } from './StudioSlider';

const networkMessages = defineMessages(
  'components.Discover.NetworkSlider.Editor',
  {
    description:
      'Choose which television networks appear on the shared Discover page.',
    idLabel: 'TMDB Network ID',
    idPlaceholder: 'Enter a TMDB network ID',
    add: 'Add Network',
    addFailed: 'Unable to add that network. Check the TMDB ID and try again.',
    alreadyAdded: 'That network is already in the list.',
    missingLogo: 'This network does not have a usable logo.',
    maximumReached: 'You can add up to 50 networks.',
    adding: 'Adding…',
    saving: 'Saving…',
    selectedCount: '{count} of {maximum} networks selected',
    noNetworks: 'No networks are selected.',
    malformed: 'Saved network data is invalid. The default list is shown.',
    moveUp: 'Move {name} up',
    moveDown: 'Move {name} down',
    remove: 'Remove {name}',
    alreadyFirst: 'This network is already first.',
    alreadyLast: 'This network is already last.',
    networkId: 'TMDB ID {id}',
    reset: 'Reset to Default List',
    save: 'Save Networks',
    saveSuccess: 'The Networks slider was updated.',
    saveFailed: 'Unable to update the Networks slider.',
  }
);

const studioMessages = defineMessages(
  'components.Discover.StudioSlider.Editor',
  {
    description:
      'Choose which production studios appear on the shared Discover page.',
    idLabel: 'TMDB Studio ID',
    idPlaceholder: 'Enter a TMDB studio ID',
    add: 'Add Studio',
    addFailed: 'Unable to add that studio. Check the TMDB ID and try again.',
    alreadyAdded: 'That studio is already in the list.',
    missingLogo: 'This studio does not have a usable logo.',
    maximumReached: 'You can add up to 50 studios.',
    adding: 'Adding…',
    saving: 'Saving…',
    selectedCount: '{count} of {maximum} studios selected',
    noNetworks: 'No studios are selected.',
    malformed: 'Saved studio data is invalid. The default list is shown.',
    moveUp: 'Move {name} up',
    moveDown: 'Move {name} down',
    remove: 'Remove {name}',
    alreadyFirst: 'This studio is already first.',
    alreadyLast: 'This studio is already last.',
    networkId: 'TMDB ID {id}',
    reset: 'Reset to Default List',
    save: 'Save Studios',
    saveSuccess: 'The Studios slider was updated.',
    saveFailed: 'Unable to update the Studios slider.',
  }
);

type CompanySliderEditorProps = {
  kind: DiscoverCompanyKind;
  sliderId?: number;
  data?: string;
  onSaved: (slider: DiscoverSlider) => void;
};

const CompanySliderEditor = ({
  kind,
  sliderId,
  data,
  onSaved,
}: CompanySliderEditorProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const defaults =
    kind === 'network' ? defaultDiscoverNetworks : defaultDiscoverStudios;
  const sliderType =
    kind === 'network'
      ? DiscoverSliderType.NETWORKS
      : DiscoverSliderType.STUDIOS;
  const title = kind === 'network' ? 'Networks' : 'Studios';
  const messages = kind === 'network' ? networkMessages : studioMessages;
  const testIdPrefix = `discover-${kind}`;
  const initialState = readDiscoverCompanyList(data, defaults, kind);
  const [companies, setCompanies] = useState<DiscoverCompanyData[]>([
    ...initialState.companies,
  ]);
  const [usesDefaults, setUsesDefaults] = useState(initialState.usesDefaults);
  const [companyId, setCompanyId] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const parseList = (value: unknown) => parseDiscoverCompanyList(value, kind);
  const notifyError = (message: (typeof messages)[keyof typeof messages]) =>
    addToast(intl.formatMessage(message), {
      appearance: 'error',
      autoDismiss: true,
    });

  const addCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!/^[1-9]\d*$/.test(companyId)) {
      notifyError(messages.addFailed);
      return;
    }

    const id = Number(companyId);
    if (!Number.isSafeInteger(id)) {
      notifyError(messages.addFailed);
      return;
    }
    if (companies.some((company) => company.id === id)) {
      notifyError(messages.alreadyAdded);
      return;
    }
    if (companies.length >= MAX_DISCOVER_COMPANIES) {
      notifyError(messages.maximumReached);
      return;
    }

    setIsLookingUp(true);
    try {
      const { data: company } = await axios.get<TvNetwork | ProductionCompany>(
        `/api/v1/${kind}/${id}`
      );
      if (
        company.id !== id ||
        typeof company.name !== 'string' ||
        !company.name.trim() ||
        !isSafeDiscoverCompanyLogoPath(company.logoPath, kind)
      ) {
        notifyError(messages.missingLogo);
        return;
      }

      const nextCompanies = [
        ...companies,
        { id, name: company.name, logoPath: company.logoPath },
      ];
      const validated = parseList(JSON.stringify(nextCompanies));
      if ('error' in validated) {
        notifyError(messages.addFailed);
        return;
      }
      setCompanies(JSON.parse(validated.value) as DiscoverCompanyData[]);
      setUsesDefaults(false);
      setCompanyId('');
    } catch {
      notifyError(messages.addFailed);
    } finally {
      setIsLookingUp(false);
    }
  };

  const updateCompanyOrder = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= companies.length) return;
    const nextCompanies = companies.slice();
    [nextCompanies[index], nextCompanies[nextIndex]] = [
      nextCompanies[nextIndex],
      nextCompanies[index],
    ];
    setCompanies(nextCompanies);
    setUsesDefaults(false);
  };

  const saveCompanies = async () => {
    if (!sliderId) {
      notifyError(messages.saveFailed);
      return;
    }
    const validated = parseList(usesDefaults ? '' : JSON.stringify(companies));
    if ('error' in validated) {
      notifyError(messages.saveFailed);
      return;
    }

    setIsSaving(true);
    try {
      const { data: updatedSlider } = await axios.put<DiscoverSlider>(
        `/api/v1/settings/discover/${sliderId}`,
        { data: validated.value, title, type: sliderType }
      );
      addToast(intl.formatMessage(messages.saveSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      onSaved(updatedSlider);
    } catch {
      notifyError(messages.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const disabled = isLookingUp || isSaving;

  return (
    <div>
      <p className="card-body-text">
        {intl.formatMessage(messages.description)}
      </p>
      {initialState.isMalformed && (
        <p className="card-body-text" role="status">
          {intl.formatMessage(messages.malformed)}
        </p>
      )}
      <form className="settings-page-content" onSubmit={addCompany}>
        <div className="form-row">
          <label htmlFor="discover-company-id" className="text-label">
            {intl.formatMessage(messages.idLabel)}
          </label>
          <div className="form-input-area">
            <div
              className="app-action-row"
              data-action-placement="leading"
              data-action-wrap="nowrap"
            >
              <input
                id="discover-company-id"
                data-testid={`${testIdPrefix}-id`}
                type="text"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                placeholder={intl.formatMessage(messages.idPlaceholder)}
                disabled={
                  disabled || companies.length >= MAX_DISCOVER_COMPANIES
                }
                autoComplete="off"
              />
              <Button
                data-testid={`${testIdPrefix}-add`}
                buttonType="primary"
                buttonSize="sm"
                type="submit"
                disabled={
                  disabled || companies.length >= MAX_DISCOVER_COMPANIES
                }
              >
                {intl.formatMessage(
                  isLookingUp ? messages.adding : messages.add
                )}
              </Button>
            </div>
            <span className="label-tip" aria-live="polite">
              {intl.formatMessage(messages.selectedCount, {
                count: companies.length,
                maximum: MAX_DISCOVER_COMPANIES,
              })}
            </span>
          </div>
        </div>
      </form>
      {companies.length ? (
        <div className="card-list" data-list-layout="stacked" role="list">
          {companies.map((company, index) => (
            <div
              key={company.id}
              className="app-action-row"
              data-action-placement="distributed"
              data-testid={`${testIdPrefix}-item`}
              role="listitem"
            >
              <div>
                <span className="card-title" data-title-weight="regular">
                  {company.name}
                </span>
                <div className="card-subheading">
                  {intl.formatMessage(messages.networkId, { id: company.id })}
                </div>
              </div>
              <div className="app-action-row" data-action-placement="leading">
                <Button
                  data-testid={`${testIdPrefix}-move-up`}
                  buttonType="default"
                  buttonSize="sm"
                  iconOnly
                  aria-label={intl.formatMessage(messages.moveUp, {
                    name: company.name,
                  })}
                  disabled={disabled || index === 0}
                  disabledReason={intl.formatMessage(messages.alreadyFirst)}
                  onClick={() => updateCompanyOrder(index, -1)}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  data-testid={`${testIdPrefix}-move-down`}
                  buttonType="default"
                  buttonSize="sm"
                  iconOnly
                  aria-label={intl.formatMessage(messages.moveDown, {
                    name: company.name,
                  })}
                  disabled={disabled || index === companies.length - 1}
                  disabledReason={intl.formatMessage(messages.alreadyLast)}
                  onClick={() => updateCompanyOrder(index, 1)}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  data-testid={`${testIdPrefix}-remove`}
                  buttonType="danger"
                  buttonSize="sm"
                  iconOnly
                  aria-label={intl.formatMessage(messages.remove, {
                    name: company.name,
                  })}
                  disabled={disabled}
                  onClick={() => {
                    setCompanies((current) =>
                      current.filter((entry) => entry.id !== company.id)
                    );
                    setUsesDefaults(false);
                  }}
                >
                  <XMarkIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="card-body-text" role="status">
          {intl.formatMessage(messages.noNetworks)}
        </p>
      )}
      <div className="app-action-row" data-action-placement="distributed">
        <Button
          data-testid={`${testIdPrefix}-reset`}
          buttonType="default"
          buttonSize="sm"
          disabled={disabled}
          onClick={() => {
            setCompanies(defaults.slice());
            setUsesDefaults(true);
          }}
        >
          {intl.formatMessage(messages.reset)}
        </Button>
        <Button
          data-testid={`${testIdPrefix}-save`}
          buttonType="primary"
          buttonSize="sm"
          disabled={disabled}
          onClick={() => void saveCompanies()}
        >
          {intl.formatMessage(isSaving ? messages.saving : messages.save)}
        </Button>
      </div>
    </div>
  );
};

export default CompanySliderEditor;
