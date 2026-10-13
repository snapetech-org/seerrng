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
  MAX_DISCOVER_NETWORKS,
  type DiscoverNetworkData,
} from '@server/constants/discover';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import {
  isSafeDiscoverNetworkLogoPath,
  parseDiscoverNetworkList,
  readDiscoverNetworkList,
} from '@server/lib/discoverNetworks';
import type { TvNetwork } from '@server/models/common';
import axios from 'axios';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { defaultDiscoverNetworks } from '.';

const messages = defineMessages('components.Discover.NetworkSlider.Editor', {
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
});

type NetworkSliderEditorProps = {
  sliderId?: number;
  data?: string;
  onSaved: (slider: DiscoverSlider) => void;
};

const NetworkSliderEditor = ({
  sliderId,
  data,
  onSaved,
}: NetworkSliderEditorProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const initialState = readDiscoverNetworkList(data, defaultDiscoverNetworks);
  const [networks, setNetworks] = useState<DiscoverNetworkData[]>([
    ...initialState.networks,
  ]);
  const [usesDefaults, setUsesDefaults] = useState(initialState.usesDefaults);
  const [networkId, setNetworkId] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const addNetwork = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!/^[1-9]\d*$/.test(networkId)) {
      addToast(intl.formatMessage(messages.addFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    const id = Number(networkId);
    if (!Number.isSafeInteger(id)) {
      addToast(intl.formatMessage(messages.addFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    if (networks.some((network) => network.id === id)) {
      addToast(intl.formatMessage(messages.alreadyAdded), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    if (networks.length >= MAX_DISCOVER_NETWORKS) {
      addToast(intl.formatMessage(messages.maximumReached), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    setIsLookingUp(true);
    try {
      const { data: network } = await axios.get<TvNetwork>(
        `/api/v1/network/${id}`
      );

      if (
        network.id !== id ||
        typeof network.name !== 'string' ||
        !network.name.trim() ||
        !isSafeDiscoverNetworkLogoPath(network.logoPath)
      ) {
        addToast(intl.formatMessage(messages.missingLogo), {
          appearance: 'error',
          autoDismiss: true,
        });
        return;
      }

      const nextNetworks = [
        ...networks,
        {
          id,
          name: network.name,
          logoPath: network.logoPath,
        },
      ];
      const validated = parseDiscoverNetworkList(JSON.stringify(nextNetworks));

      if ('error' in validated) {
        addToast(intl.formatMessage(messages.addFailed), {
          appearance: 'error',
          autoDismiss: true,
        });
        return;
      }

      setNetworks(JSON.parse(validated.value) as DiscoverNetworkData[]);
      setUsesDefaults(false);
      setNetworkId('');
    } catch {
      addToast(intl.formatMessage(messages.addFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const updateNetworkOrder = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= networks.length) {
      return;
    }

    const nextNetworks = networks.slice();
    [nextNetworks[index], nextNetworks[nextIndex]] = [
      nextNetworks[nextIndex],
      nextNetworks[index],
    ];
    setNetworks(nextNetworks);
    setUsesDefaults(false);
  };

  const saveNetworks = async () => {
    if (!sliderId) {
      addToast(intl.formatMessage(messages.saveFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    const data = usesDefaults ? '' : JSON.stringify(networks);
    const validated = parseDiscoverNetworkList(data);
    if ('error' in validated) {
      addToast(intl.formatMessage(messages.saveFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: updatedSlider } = await axios.put<DiscoverSlider>(
        `/api/v1/settings/discover/${sliderId}`,
        {
          data: validated.value,
          title: 'Networks',
          type: DiscoverSliderType.NETWORKS,
        }
      );

      addToast(intl.formatMessage(messages.saveSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      setIsSaving(false);
      onSaved(updatedSlider);
    } catch {
      setIsSaving(false);
      addToast(intl.formatMessage(messages.saveFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
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
      <form className="settings-page-content" onSubmit={addNetwork}>
        <div className="form-row">
          <label htmlFor="discover-network-id" className="text-label">
            {intl.formatMessage(messages.idLabel)}
          </label>
          <div className="form-input-area">
            <div
              className="app-action-row"
              data-action-placement="leading"
              data-action-wrap="nowrap"
            >
              <input
                id="discover-network-id"
                data-testid="discover-network-id"
                type="text"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={networkId}
                onChange={(event) => setNetworkId(event.target.value)}
                placeholder={intl.formatMessage(messages.idPlaceholder)}
                disabled={disabled || networks.length >= MAX_DISCOVER_NETWORKS}
                autoComplete="off"
              />
              <Button
                buttonType="primary"
                buttonSize="sm"
                type="submit"
                disabled={disabled || networks.length >= MAX_DISCOVER_NETWORKS}
                data-testid="discover-network-add"
              >
                {intl.formatMessage(
                  isLookingUp ? messages.adding : messages.add
                )}
              </Button>
            </div>
            <span className="label-tip" aria-live="polite">
              {intl.formatMessage(messages.selectedCount, {
                count: networks.length,
                maximum: MAX_DISCOVER_NETWORKS,
              })}
            </span>
          </div>
        </div>
      </form>
      {networks.length ? (
        <div className="card-list" data-list-layout="stacked" role="list">
          {networks.map((network, index) => (
            <div
              key={network.id}
              className="app-action-row"
              data-action-placement="distributed"
              data-testid="discover-network-item"
              role="listitem"
            >
              <div>
                <span className="card-title" data-title-weight="regular">
                  {network.name}
                </span>
                <div className="card-subheading">
                  {intl.formatMessage(messages.networkId, { id: network.id })}
                </div>
              </div>
              <div className="app-action-row" data-action-placement="leading">
                <Button
                  buttonType="default"
                  buttonSize="sm"
                  iconOnly
                  aria-label={intl.formatMessage(messages.moveUp, {
                    name: network.name,
                  })}
                  disabled={disabled || index === 0}
                  disabledReason={intl.formatMessage(messages.alreadyFirst)}
                  onClick={() => updateNetworkOrder(index, -1)}
                  data-testid="discover-network-move-up"
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  buttonType="default"
                  buttonSize="sm"
                  iconOnly
                  aria-label={intl.formatMessage(messages.moveDown, {
                    name: network.name,
                  })}
                  disabled={disabled || index === networks.length - 1}
                  disabledReason={intl.formatMessage(messages.alreadyLast)}
                  onClick={() => updateNetworkOrder(index, 1)}
                  data-testid="discover-network-move-down"
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  buttonType="danger"
                  buttonSize="sm"
                  iconOnly
                  aria-label={intl.formatMessage(messages.remove, {
                    name: network.name,
                  })}
                  disabled={disabled}
                  onClick={() => {
                    setNetworks((currentNetworks) =>
                      currentNetworks.filter((item) => item.id !== network.id)
                    );
                    setUsesDefaults(false);
                  }}
                  data-testid="discover-network-remove"
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
          buttonType="default"
          buttonSize="sm"
          disabled={disabled}
          onClick={() => {
            setNetworks(defaultDiscoverNetworks.slice());
            setUsesDefaults(true);
          }}
          data-testid="discover-network-reset"
        >
          {intl.formatMessage(messages.reset)}
        </Button>
        <Button
          buttonType="primary"
          buttonSize="sm"
          disabled={disabled}
          onClick={() => void saveNetworks()}
          data-testid="discover-network-save"
        >
          {intl.formatMessage(isSaving ? messages.saving : messages.save)}
        </Button>
      </div>
    </div>
  );
};

export default NetworkSliderEditor;
