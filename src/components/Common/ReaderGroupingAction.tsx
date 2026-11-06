import Alert from '@app/components/Common/Alert';
import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

type ReaderGroupingTargetType = 'author' | 'book-series' | 'comic-series';
type ReaderGroupingProvider = 'grimmory' | 'bookorbit';

interface ReaderGroupingTarget {
  type: ReaderGroupingTargetType;
  id: string;
  name: string;
}

interface ReaderGroupingPreview {
  provider: ReaderGroupingProvider;
  matchedCount: number;
  sampleTitles: string[];
  ruleSummary: string;
}

interface ReaderGroupingRecord {
  id: number;
  provider: ReaderGroupingProvider;
  targetType: ReaderGroupingTargetType;
  targetId: string;
  isPublic: boolean;
  syncToKobo: boolean;
  koboSyncStatus: 'disabled' | 'pending' | 'ready' | 'error';
  koboSyncError: string | null;
  lastKoboSyncedAt?: string | null;
  status: 'pending' | 'ready' | 'error';
  lastMatchCount: number;
  countVerified: boolean;
  lastError: string | null;
}

interface ReaderGroupingResponse {
  grouping: ReaderGroupingRecord & {
    serviceUrl: string;
    groupName: string;
  };
  previewCount: number;
  sampleTitles: string[];
  ruleSummary: string;
  warning?: string;
}

const messages = defineMessages('components.ReaderGroupingAction', {
  action: 'Create reader shelf',
  updateAction: 'Update reader shelf',
  heading: 'Make this a reader shelf',
  intro:
    'SeerrNG will create a live, rule-based grouping in your reader service. It stays up to date as that library changes; it does not copy files.',
  provider: 'Reader service',
  grimmory: 'Grimmory (Recommended)',
  bookorbit: 'BookOrbit',
  share: 'Show this grouping to other reader-service users',
  shareHelp:
    'If your reader or OPDS account belongs to another reader-service user, share this grouping so that account can see it. The reader account still needs access to the matching library.',
  syncToKobo: 'Sync this live rule to Kobo',
  syncToKoboHelp:
    'When enabled, SeerrNG creates a managed BookOrbit Collection and reconciles its members with this live rule every 15 minutes. Pair the Kobo account in BookOrbit.',
  koboSyncReady: 'The managed BookOrbit Collection is synced to Kobo.',
  grimmoryKobo:
    'Grimmory Kobo delivery uses its separate inclusion shelf. SeerrNG leaves that provider setting unchanged.',
  preview: 'Preview matches',
  previewing: 'Checking library…',
  previewError: 'The reader library could not be checked.',
  noMatches: 'No current books match this rule.',
  matches: '{count, plural, one {# current match} other {# current matches}}',
  sampleTitles: 'A few matches',
  emptyOptIn:
    'Create this live rule anyway so future matching books appear automatically.',
  save: 'Create shelf',
  update: 'Save shelf updates',
  saving: 'Saving shelf…',
  saveError: 'The reader shelf could not be saved.',
  setup:
    'Set up a reader service in Settings > Services > Reader Apps, then return here.',
  result: 'Reader shelf saved',
  open: 'Open {serviceName}',
  warning:
    'The shelf was saved, but the service has not confirmed its current item count. Open the service and refresh the shelf to check it.',
  close: 'Close',
  countPending:
    'Preview count: {count}. The reader service has not confirmed the saved count yet.',
  visibilityLocked:
    'BookOrbit locks visibility when the scope is created. Change it in BookOrbit or remove and recreate the managed scope.',
  openClose: 'Close shelf setup',
});

const getError = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;

const ReaderGroupingAction = ({ target }: { target: ReaderGroupingTarget }) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const canManage = hasPermission([Permission.ADMIN]);
  const { data: settings } = useSWR<{
    preferredProvider: ReaderGroupingProvider;
  }>(canManage ? '/api/v1/settings/reader-delivery' : null);
  const { data: groupings, mutate: refreshGroupings } = useSWR<
    ReaderGroupingRecord[]
  >(canManage ? '/api/v1/settings/reader-delivery/groupings' : null);
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<ReaderGroupingProvider>('grimmory');
  const [isPublic, setIsPublic] = useState(true);
  const [syncToKobo, setSyncToKobo] = useState(false);
  const [allowEmpty, setAllowEmpty] = useState(false);
  const [preview, setPreview] = useState<ReaderGroupingPreview>();
  const [result, setResult] = useState<ReaderGroupingResponse>();
  const [error, setError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const targetIdentity = target.type + '\0' + target.id + '\0' + target.name;
  const activeTargetIdentity = useRef(targetIdentity);

  useEffect(() => {
    activeTargetIdentity.current = targetIdentity;
    setIsOpen(false);
    setPreview(undefined);
    setResult(undefined);
    setError(undefined);
    setAllowEmpty(false);
    setSyncToKobo(false);
    setIsBusy(false);
  }, [targetIdentity]);

  const existingGrouping = useMemo(
    () =>
      groupings?.find(
        (grouping) =>
          grouping.provider === provider &&
          grouping.targetType === target.type &&
          grouping.targetId === target.id
      ),
    [groupings, provider, target.id, target.type]
  );

  useEffect(() => {
    if (settings?.preferredProvider && !isOpen) {
      setProvider(settings.preferredProvider);
    }
  }, [settings?.preferredProvider, isOpen]);

  useEffect(() => {
    if (!isOpen || !existingGrouping) return;
    setIsPublic(existingGrouping.isPublic);
    setSyncToKobo(existingGrouping.syncToKobo ?? false);
  }, [existingGrouping, isOpen]);

  const resetPreview = () => {
    setPreview(undefined);
    setResult(undefined);
    setError(undefined);
    setAllowEmpty(false);
  };

  const toggleOpen = () => {
    setIsOpen((current) => !current);
    resetPreview();
  };

  const runPreview = async () => {
    const requestTargetIdentity = targetIdentity;
    const requestTarget = { ...target };
    setIsBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const response = await axios.post<ReaderGroupingPreview>(
        '/api/v1/settings/reader-delivery/groupings/preview',
        { provider, target: requestTarget }
      );
      if (activeTargetIdentity.current === requestTargetIdentity) {
        setPreview(response.data);
      }
    } catch (previewError) {
      if (activeTargetIdentity.current === requestTargetIdentity) {
        setError(
          getError(previewError, intl.formatMessage(messages.previewError))
        );
      }
    } finally {
      if (activeTargetIdentity.current === requestTargetIdentity) {
        setIsBusy(false);
      }
    }
  };

  const saveGrouping = async () => {
    const requestTargetIdentity = targetIdentity;
    const requestTarget = { ...target };
    setIsBusy(true);
    setError(undefined);
    try {
      const response = await axios.post<ReaderGroupingResponse>(
        '/api/v1/settings/reader-delivery/groupings',
        {
          provider,
          target: requestTarget,
          isPublic,
          syncToKobo: provider === 'bookorbit' && syncToKobo,
          allowEmpty,
        }
      );
      if (activeTargetIdentity.current === requestTargetIdentity) {
        setResult(response.data);
        setPreview(undefined);
      }
      await refreshGroupings().catch(() => undefined);
    } catch (saveError) {
      if (activeTargetIdentity.current === requestTargetIdentity) {
        const detail = getError(
          saveError,
          intl.formatMessage(messages.saveError)
        );
        setError(detail);
        if (
          axios.isAxiosError(saveError) &&
          saveError.response?.data?.code === 'empty-match'
        ) {
          setPreview({
            provider,
            matchedCount: 0,
            sampleTitles: [],
            ruleSummary: '',
          });
        }
      }
    } finally {
      if (activeTargetIdentity.current === requestTargetIdentity) {
        setIsBusy(false);
      }
    }
  };

  if (!canManage || !target.id || !target.name) return null;

  const serviceName = provider === 'grimmory' ? 'Grimmory' : 'BookOrbit';
  const openHref = getSafeHref(result?.grouping.serviceUrl);

  return (
    <div>
      <Button
        type="button"
        buttonSize="sm"
        aria-expanded={isOpen}
        aria-controls="reader-grouping-action-panel"
        onClick={toggleOpen}
      >
        {intl.formatMessage(
          isOpen
            ? messages.openClose
            : existingGrouping
              ? messages.updateAction
              : messages.action
        )}
      </Button>
      {isOpen && (
        <section
          id="reader-grouping-action-panel"
          className="app-card-sub settings-group-card"
          aria-label={intl.formatMessage(messages.heading)}
        >
          <h3 className="settings-group-heading">
            {intl.formatMessage(messages.heading)}
          </h3>
          <p className="settings-group-description">
            {intl.formatMessage(messages.intro)}
          </p>
          {error && (
            <Alert
              type="error"
              title={<ApiMessageText>{error}</ApiMessageText>}
            />
          )}
          {result ? (
            <>
              <Alert type="info" title={intl.formatMessage(messages.result)}>
                <p>{result.grouping.groupName}</p>
                <p>{<ApiMessageText>{result.ruleSummary}</ApiMessageText>}</p>
                {result.grouping.countVerified ? (
                  <p>
                    {intl.formatMessage(messages.matches, {
                      count: result.grouping.lastMatchCount,
                    })}
                  </p>
                ) : (
                  <p>
                    {intl.formatMessage(messages.countPending, {
                      count: result.previewCount,
                    })}
                  </p>
                )}
                {result.grouping.koboSyncStatus === 'ready' && (
                  <p>{intl.formatMessage(messages.koboSyncReady)}</p>
                )}
                {result.grouping.koboSyncError && (
                  <p>
                    {
                      <ApiMessageText>
                        {result.grouping.koboSyncError}
                      </ApiMessageText>
                    }
                  </p>
                )}
                {result.warning &&
                  result.warning !== result.grouping.koboSyncError && (
                    <p>{intl.formatMessage(messages.warning)}</p>
                  )}
              </Alert>
              {openHref && (
                <Button
                  as="a"
                  href={openHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  buttonType="externalService"
                  buttonSize="sm"
                >
                  {intl.formatMessage(messages.open, { serviceName })}
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="form-row">
                <label htmlFor="reader-grouping-provider">
                  {intl.formatMessage(messages.provider)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <select
                      id="reader-grouping-provider"
                      value={provider}
                      disabled={isBusy}
                      onChange={(event) => {
                        setProvider(
                          event.currentTarget.value as ReaderGroupingProvider
                        );
                        setSyncToKobo(false);
                        resetPreview();
                      }}
                    >
                      <option value="grimmory">
                        {intl.formatMessage(messages.grimmory)}
                      </option>
                      <option value="bookorbit">
                        {intl.formatMessage(messages.bookorbit)}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-input-area">
                  <label className="form-input-field">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      disabled={
                        isBusy ||
                        (!!existingGrouping && provider === 'bookorbit')
                      }
                      onChange={(event) => {
                        setIsPublic(event.currentTarget.checked);
                        resetPreview();
                      }}
                    />
                    <span>{intl.formatMessage(messages.share)}</span>
                  </label>
                  <p className="settings-form-row-description">
                    {intl.formatMessage(messages.shareHelp)}
                  </p>
                  {existingGrouping && provider === 'bookorbit' && (
                    <p className="settings-form-row-description">
                      {intl.formatMessage(messages.visibilityLocked)}
                    </p>
                  )}
                </div>
              </div>
              {provider === 'bookorbit' ? (
                <>
                  <div className="form-row">
                    <div className="form-input-area">
                      <label className="form-input-field">
                        <input
                          type="checkbox"
                          checked={syncToKobo}
                          disabled={isBusy}
                          onChange={(event) =>
                            setSyncToKobo(event.currentTarget.checked)
                          }
                        />
                        <span>{intl.formatMessage(messages.syncToKobo)}</span>
                      </label>
                      <p className="settings-form-row-description">
                        {intl.formatMessage(messages.syncToKoboHelp)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <Alert type="info">
                  {intl.formatMessage(messages.grimmoryKobo)}
                </Alert>
              )}
              {preview && (
                <Alert
                  type={preview.matchedCount > 0 ? 'info' : 'warning'}
                  title={
                    preview.matchedCount > 0
                      ? intl.formatMessage(messages.matches, {
                          count: preview.matchedCount,
                        })
                      : intl.formatMessage(messages.noMatches)
                  }
                >
                  {preview.ruleSummary && (
                    <p>
                      {<ApiMessageText>{preview.ruleSummary}</ApiMessageText>}
                    </p>
                  )}
                  {preview.sampleTitles.length > 0 && (
                    <>
                      <p>{intl.formatMessage(messages.sampleTitles)}</p>
                      <ul>
                        {preview.sampleTitles.map((title) => (
                          <li key={title}>{title}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {preview.matchedCount === 0 && (
                    <label className="form-input-field">
                      <input
                        type="checkbox"
                        checked={allowEmpty}
                        onChange={(event) =>
                          setAllowEmpty(event.currentTarget.checked)
                        }
                      />
                      <span>{intl.formatMessage(messages.emptyOptIn)}</span>
                    </label>
                  )}
                </Alert>
              )}
              <div className="settings-card-actions">
                <Button
                  type="button"
                  buttonSize="sm"
                  disabled={isBusy}
                  onClick={() => void runPreview()}
                >
                  {intl.formatMessage(
                    isBusy ? messages.previewing : messages.preview
                  )}
                </Button>
                {preview && (preview.matchedCount > 0 || allowEmpty) && (
                  <Button
                    type="button"
                    buttonType="primary"
                    buttonSize="sm"
                    disabled={isBusy}
                    onClick={() => void saveGrouping()}
                  >
                    {intl.formatMessage(
                      isBusy
                        ? messages.saving
                        : existingGrouping
                          ? messages.update
                          : messages.save
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  buttonSize="sm"
                  disabled={isBusy}
                  onClick={toggleOpen}
                >
                  {intl.formatMessage(messages.close)}
                </Button>
              </div>
              {!settings && (
                <p className="settings-form-row-description" role="status">
                  {intl.formatMessage(messages.setup)}
                </p>
              )}
              {isBusy && <LoadingSpinner />}
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default ReaderGroupingAction;
