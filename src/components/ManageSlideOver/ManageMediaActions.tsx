import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import Tooltip from '@app/components/Common/Tooltip';
import {
  deleteRequestStatus,
  RequestActionButton,
  RequestActionConfirmation,
  requestActionMessages,
  type LibraryRemovalTarget,
} from '@app/components/Requests/destructiveActions';
import useTitleBlocklist from '@app/hooks/useTitleBlocklist';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import { Transition } from '@headlessui/react';
import {
  ArchiveBoxXMarkIcon,
  ChevronDownIcon,
  EyeIcon,
  NoSymbolIcon,
  ServerIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus, MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { LibraryRemovalPlan } from '@server/interfaces/api/libraryRemoval';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useEffect, useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';
import ManageIssuesPanel from './ManageIssuesPanel';
import {
  addManageBlocklist,
  getManageIssueIds,
  removeManageBlocklist,
  updateManageIssues,
} from './manageAdvancedActions';

const messages = defineMessages('components.ManageMediaActions', {
  services: 'Service',
  openService: 'Open title in {service}',
  openServiceTooltip:
    'Open this media’s page in {service} in a new browser tab or window.',
  servicesDescription:
    'Delete From Library permanently removes all quality versions and library entries for this title from every service listed in the confirmation.',
  removeAllTitle: 'Delete From Library?',
  titleWithYear: '{title} ({year})',
  removeAllDescription:
    'Permanently delete all quality versions, their media files and library entries from every service listed below. This cannot be undone from Seerr. Once a movie or series has no remaining library copies, confirmed by library reconciliation, its requests and issues are also removed. Blocklists and watchlists remain. Other titles are unaffected.',
  checkingLibraries:
    'Checking all configured library services for copies of this title.',
  libraryLookupFailed:
    'Unable to verify all library services or identify this comic’s backend. Refresh its metadata or check service availability before deleting.',
  retryLibraries: 'Retry Library Check',
  clearStaleAvailability: 'Clear Stale {quality} Availability',
  clearStaleAvailabilityTitle: 'Clear Stale {quality} Availability?',
  clearStaleAvailabilityExplanation:
    'Reset SeerrNG’s {quality} availability status to Unknown. The latest check found no copy in any configured {service} library. This does not delete files, requests, or issues. A media-server scan may report availability again if a copy remains.',
  clearStaleAvailabilitySuccess: 'Stale availability cleared.',
  clearStaleAvailabilityFailed: 'Unable to clear stale availability.',
  blocklist: 'Blocklist',
  block: 'Blocklist Title',
  blockDescription:
    'Add this title to the Seerr blocklist to prevent future requests. Existing library files are not deleted.',
  blockConfirm: 'Blocklist Title?',
  alreadyBlocklisted: 'This title is already blocklisted.',
  missingBlocklistId: 'This title has no valid blocklist identifier.',
  blocklistPermission: 'You do not have permission to manage the blocklist.',
  checkingBlocklist: 'Checking whether this title is blocklisted.',
  blocklistCheckFailed:
    'Unable to check the blocklist. Reopen Manage to retry.',
  unblock: 'Remove From Blocklist',
  unblockDescription:
    'Remove From Blocklist allows this title to be requested again.',
  unblockConfirm: 'Remove From Blocklist?',
  notBlocklisted: 'This media is not currently blocklisted.',
  requests: 'Request',
  deleteRequests: 'Delete Request',
  explanation:
    'Delete Request cancels identifiable active request work and removes the selected request and its history.',
  issues: 'Issues',
  viewIssues: 'View All Issues',
  viewIssuesDescription:
    'View all open and resolved issues reported for this media.',
  noIssues: 'There are no issues for this media.',
  noOpenIssues: 'There are no open issues to close for this media.',
  closeIssues: 'Close Open Issues',
  deleteIssues: 'Delete All Issues',
  issuesDescription:
    'Close Open Issues marks its open issues as resolved and keeps their history. Delete All Issues permanently removes all its issues and their comments, including resolved issues.',
  closeConfirm:
    'Close {count, plural, one {# open issue} other {# open issues}}?',
  deleteConfirm: 'Delete {count, plural, one {# issue} other {# issues}}?',
  closeDescription:
    'Mark all currently open issues for this media as resolved. Keep their comments and history so they can still be viewed or reopened. Requests, library entries, and media files are not deleted. Issues for other media are not changed.',
  deleteDescription:
    'These issues and all their comments will be permanently deleted. This cannot be undone.',
  issueLink: 'Issue #{id} — {status}',
  open: 'Open',
  resolved: 'Resolved',
  cancel: 'Cancel',
  done: 'Done',
  updated: 'Changes saved.',
  failed:
    'The action could not be completed. Status is being refreshed; some issues may already have been updated.',
  selectRequest: 'Request to delete',
  selectLibrary: 'Library item to delete',
  requestOption: 'Request #{id} — {user} — {format}',
  noRequests: 'No request is linked to this title.',
  unknownUser: 'Unknown user',
  ebook: 'Book',
  audiobook: 'Audiobook',
  both: 'Book and Audiobook',
});

type Target = LibraryRemovalTarget & { key: string; service: string };
type LibraryQuality = 'HD' | '4K';

const hasStaleAvailabilityStatus = (status?: MediaStatus) =>
  status === MediaStatus.AVAILABLE ||
  status === MediaStatus.PARTIALLY_AVAILABLE;

const canClearStaleAvailability = (
  media: Media,
  mediaType: MediaType,
  quality: LibraryQuality,
  plan?: LibraryRemovalPlan,
  libraryError?: unknown
) => {
  if (
    (mediaType !== MediaType.MOVIE && mediaType !== MediaType.TV) ||
    !plan ||
    libraryError ||
    plan.verifiedServices < 1 ||
    plan.targets.some((target) => target.quality === quality)
  )
    return false;

  const statusKey = quality === '4K' ? 'status4k' : 'status';
  const status = media[statusKey];
  if (status === MediaStatus.BLOCKLISTED) return false;

  return (
    hasStaleAvailabilityStatus(status) ||
    (mediaType === MediaType.TV &&
      (media.seasons ?? []).some((season) =>
        hasStaleAvailabilityStatus(season[statusKey])
      ))
  );
};

// A server or media ID of zero is valid; missing links must not fall back to
// deleting a different/default library. The API remains the permission authority.
export const getManageLibraryTargets = (
  media: Media,
  mediaType: MediaType
): Target[] => {
  const targets: Target[] = [];
  const linked = (serviceId?: number | null, externalId?: number | null) =>
    serviceId != null && externalId != null;
  const arr = mediaType === MediaType.MOVIE ? 'Radarr' : 'Sonarr';
  if (linked(media.serviceId, media.externalServiceId)) {
    targets.push({
      key: 'primary',
      mediaId: media.id,
      is4k: false,
      format: mediaType === MediaType.BOOK ? 'ebook' : undefined,
      service:
        mediaType === MediaType.MUSIC
          ? 'Lidarr'
          : mediaType === MediaType.BOOK
            ? 'Bookshelf (Book)'
            : `${arr} (HD)`,
    });
  }
  if (
    (mediaType === MediaType.MOVIE || mediaType === MediaType.TV) &&
    linked(media.serviceId4k, media.externalServiceId4k)
  ) {
    targets.push({
      key: '4k',
      mediaId: media.id,
      is4k: true,
      service: `${arr} (4K)`,
    });
  }
  if (
    mediaType === MediaType.BOOK &&
    linked(media.audiobookServiceId, media.audiobookExternalServiceId)
  ) {
    targets.push({
      key: 'audiobook',
      mediaId: media.id,
      is4k: false,
      format: 'audiobook',
      service: 'Bookshelf (Audiobook)',
    });
  }
  return targets;
};

const ManageMediaActions = ({
  media,
  mediaType,
  title,
  year,
  onUpdate,
  onDialogChange,
  externalId,
}: {
  media: Media;
  mediaType: MediaType;
  title: string;
  year?: string | number;
  onUpdate: () => void;
  onDialogChange?: (open: boolean) => void;
  externalId?: string | null;
}) => {
  const intl = useIntl();
  const router = useRouter();
  const displayTitle =
    year && /^\d{4}$/.test(String(year))
      ? intl.formatMessage(messages.titleWithYear, {
          title,
          year: String(year),
        })
      : title;
  const { hasPermission } = useUser();
  const isAdmin = hasPermission(Permission.ADMIN);
  const { addToast } = useToasts();
  const [action, setAction] = useState<
    | 'delete'
    | 'remove'
    | 'clearAvailability'
    | 'block'
    | 'unblock'
    | 'closeIssues'
    | 'deleteIssues'
    | null
  >(null);
  const [issueIds, setIssueIds] = useState<number[]>([]);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [availabilityQuality, setAvailabilityQuality] =
    useState<LibraryQuality | null>(null);
  const [confirmedLibrary, setConfirmedLibrary] =
    useState<LibraryRemovalPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuesExpanded, setIssuesExpanded] = useState(
    router.query.issues === '1'
  );
  const issuesPanelId = useId();
  const blocklistId =
    mediaType === MediaType.MUSIC ||
    mediaType === MediaType.BOOK ||
    mediaType === MediaType.COMIC
      ? externalId
      : mediaType === MediaType.MAGAZINE
        ? undefined
        : media.tmdbId;
  const {
    isBlocklisted,
    checking: checkingBlocklist,
    error: blocklistError,
    setBlocklisted,
  } = useTitleBlocklist(
    blocklistId,
    mediaType,
    media.status === MediaStatus.BLOCKLISTED
  );
  const inFlight = useRef(false);
  const requests = media.requests ?? [];
  const {
    data: libraryPlan,
    error: libraryError,
    mutate: refreshLibrary,
  } = useSWR<LibraryRemovalPlan>(
    isAdmin ? `/api/v1/media/${media.id}/library` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const targets = libraryPlan?.targets ?? [];
  const issues = media.issues ?? [];
  const openIssueIds = getManageIssueIds(issues, 'closeIssues');
  const canManageIssues = hasPermission(Permission.MANAGE_ISSUES);
  const canViewIssues = hasPermission(
    [Permission.MANAGE_ISSUES, Permission.VIEW_ISSUES],
    { type: 'or' }
  );
  const canUnblock =
    hasPermission(Permission.MANAGE_BLOCKLIST) &&
    !checkingBlocklist &&
    !blocklistError &&
    isBlocklisted &&
    !!blocklistId;
  const canBlock =
    hasPermission(Permission.MANAGE_BLOCKLIST) &&
    !checkingBlocklist &&
    !blocklistError &&
    !isBlocklisted &&
    !!blocklistId;
  const request = requests.find((item) => item.id === requestId);
  useEffect(() => {
    onDialogChange?.(action !== null);
    return () => onDialogChange?.(false);
  }, [action, onDialogChange]);
  if (!hasPermission(Permission.MANAGE_REQUESTS)) return null;

  const confirm = async () => {
    if (
      inFlight.current ||
      !action ||
      (action === 'delete' && !request) ||
      (action === 'remove' &&
        (!isAdmin || !confirmedLibrary?.targets.length)) ||
      (action === 'clearAvailability' &&
        (!isAdmin ||
          !availabilityQuality ||
          !canClearStaleAvailability(
            media,
            mediaType,
            availabilityQuality,
            libraryPlan,
            libraryError
          ))) ||
      (action === 'block' && !canBlock) ||
      (action === 'unblock' && !canUnblock) ||
      ((action === 'closeIssues' || action === 'deleteIssues') &&
        (!canManageIssues || !issueIds.length))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (action === 'delete' && request) await deleteRequestStatus(request.id);
      else if (action === 'remove' && confirmedLibrary)
        await axios.delete(`/api/v1/media/${media.id}/library`, {
          data: { token: confirmedLibrary.token },
        });
      else if (
        action === 'clearAvailability' &&
        availabilityQuality &&
        libraryPlan
      )
        await axios.post(
          `/api/v1/media/${media.id}/library/clear-stale-availability`,
          { token: libraryPlan.token, quality: availabilityQuality }
        );
      else if (action === 'block' && blocklistId) {
        await addManageBlocklist(blocklistId, mediaType, title);
        await setBlocklisted(true);
      } else if (action === 'unblock' && blocklistId) {
        await removeManageBlocklist(blocklistId, mediaType);
        await setBlocklisted(false);
      } else if (action === 'closeIssues' || action === 'deleteIssues')
        await updateManageIssues(issueIds, action);
      addToast(
        intl.formatMessage(
          action === 'delete'
            ? requestActionMessages.deleteSuccess
            : action === 'remove'
              ? requestActionMessages.removeSuccess
              : action === 'clearAvailability'
                ? messages.clearStaleAvailabilitySuccess
                : messages.updated
        ),
        { appearance: 'success', autoDismiss: true }
      );
      setAction(null);
      setAvailabilityQuality(null);
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? error.response?.data?.message
        : undefined;
      const message = intl.formatMessage(
        action === 'delete'
          ? requestActionMessages.deleteFailed
          : action === 'remove'
            ? requestActionMessages.removeFailed
            : action === 'clearAvailability'
              ? messages.clearStaleAvailabilityFailed
              : messages.failed
      );
      addToast(detail ? `${message} ${detail}` : message, {
        appearance: 'error',
        autoDismiss: true,
      });
      setAction(null);
      setAvailabilityQuality(null);
    } finally {
      onUpdate();
      if (action === 'remove' || action === 'clearAvailability')
        void refreshLibrary();
      void mutate('/api/v1/issue/count');
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div data-testid="manage-advanced-sections" className="card-stack">
      {isAdmin && (
        <section className="manage-advanced-section">
          <h4 className="manage-media-section-title">
            {intl.formatMessage(messages.services)}
          </h4>
          <div className="manage-request-action-buttons">
            {targets.map((item) => {
              const url = getSafeHref(item.url);
              return url ? (
                <Tooltip
                  key={item.key}
                  content={intl.formatMessage(messages.openServiceTooltip, {
                    service: item.service,
                  })}
                >
                  <Button
                    as="a"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    buttonType="success"
                    buttonSize="standard"
                  >
                    <ServerIcon />
                    <span>
                      {intl.formatMessage(messages.openService, {
                        service: item.service,
                      })}
                    </span>
                  </Button>
                </Tooltip>
              ) : null;
            })}
            <RequestActionButton
              action="remove"
              tooltip={
                targets.length
                  ? intl.formatMessage(messages.removeAllDescription)
                  : intl.formatMessage(
                      libraryError
                        ? messages.libraryLookupFailed
                        : !libraryPlan
                          ? messages.checkingLibraries
                          : requestActionMessages.removeUnavailableTooltip
                    )
              }
              disabled={busy || !!libraryError || !targets.length}
              unavailable={!targets.length}
              onClick={() => {
                if (!libraryPlan || libraryError) return;
                setConfirmedLibrary({
                  token: libraryPlan.token,
                  targets: libraryPlan.targets.map((copy) => ({ ...copy })),
                });
                setAction('remove');
              }}
            />
            {(['HD', '4K'] as const).map((quality) =>
              canClearStaleAvailability(
                media,
                mediaType,
                quality,
                libraryPlan,
                libraryError
              ) ? (
                <Button
                  key={quality}
                  buttonType="warning"
                  buttonSize="standard"
                  disabled={busy}
                  title={intl.formatMessage(
                    messages.clearStaleAvailabilityExplanation,
                    {
                      quality,
                      service: mediaType === MediaType.TV ? 'Sonarr' : 'Radarr',
                    }
                  )}
                  onClick={() => {
                    if (
                      !canClearStaleAvailability(
                        media,
                        mediaType,
                        quality,
                        libraryPlan,
                        libraryError
                      )
                    )
                      return;
                    setAvailabilityQuality(quality);
                    setAction('clearAvailability');
                  }}
                >
                  {intl.formatMessage(messages.clearStaleAvailability, {
                    quality,
                  })}
                </Button>
              ) : null
            )}
            {libraryError && (
              <Button
                title={intl.formatMessage(messages.libraryLookupFailed)}
                onClick={() => void refreshLibrary()}
              >
                {intl.formatMessage(messages.retryLibraries)}
              </Button>
            )}
          </div>
          <p className="manage-action-note">
            {intl.formatMessage(messages.servicesDescription)}
          </p>
        </section>
      )}
      {mediaType !== MediaType.MAGAZINE && (
        <section className="manage-advanced-section">
          <h4 className="manage-media-section-title">
            {intl.formatMessage(messages.blocklist)}
          </h4>
          <div className="manage-request-action-buttons">
            <Button
              buttonType="danger"
              disabled={!canBlock || busy}
              title={intl.formatMessage(messages.blockDescription)}
              disabledReason={intl.formatMessage(
                blocklistError
                  ? messages.blocklistCheckFailed
                  : checkingBlocklist
                    ? messages.checkingBlocklist
                    : isBlocklisted
                      ? messages.alreadyBlocklisted
                      : !hasPermission(Permission.MANAGE_BLOCKLIST)
                        ? messages.blocklistPermission
                        : !blocklistId
                          ? messages.missingBlocklistId
                          : messages.blockDescription
              )}
              onClick={() => setAction('block')}
            >
              <EyeIcon aria-hidden="true" />
              {intl.formatMessage(messages.block)}
            </Button>
            <Tooltip
              className="manage-action-tooltip"
              content={intl.formatMessage(
                blocklistError
                  ? messages.blocklistCheckFailed
                  : checkingBlocklist
                    ? messages.checkingBlocklist
                    : isBlocklisted
                      ? messages.unblockDescription
                      : messages.notBlocklisted
              )}
            >
              <span className="inline-flex">
                <Button
                  buttonType="danger"
                  disabled={!canUnblock || busy}
                  disabledReason=""
                  onClick={() => setAction('unblock')}
                >
                  <ArchiveBoxXMarkIcon aria-hidden="true" />
                  {intl.formatMessage(messages.unblock)}
                </Button>
              </span>
            </Tooltip>
          </div>
          <p className="manage-action-note">
            {intl.formatMessage(messages.unblockDescription)}
          </p>
        </section>
      )}
      <section className="manage-advanced-section">
        <h4 className="manage-media-section-title">
          {intl.formatMessage(messages.requests)}
        </h4>
        <div className="manage-request-action-buttons">
          <RequestActionButton
            action="delete"
            label={intl.formatMessage(messages.deleteRequests)}
            tooltip={intl.formatMessage(messages.explanation)}
            disabledReason={
              requests.length === 0
                ? intl.formatMessage(messages.noRequests)
                : undefined
            }
            disabled={requests.length === 0 || busy}
            onClick={() => {
              setRequestId(requests[0]?.id ?? null);
              setAction('delete');
            }}
          />
        </div>
        <p className="manage-action-note">
          {intl.formatMessage(messages.explanation)}
        </p>
      </section>
      <section className="manage-advanced-section">
        <h4 className="manage-media-section-title">
          {intl.formatMessage(messages.issues)}
        </h4>
        <div className="manage-request-action-buttons">
          <Button
            buttonType="success"
            disabled={!canViewIssues || !issues.length || busy}
            title={intl.formatMessage(messages.viewIssuesDescription)}
            disabledReason={
              !issues.length ? intl.formatMessage(messages.noIssues) : undefined
            }
            aria-expanded={issuesExpanded}
            aria-controls={issuesPanelId}
            onClick={() => setIssuesExpanded((expanded) => !expanded)}
          >
            <EyeIcon />
            <span>{intl.formatMessage(messages.viewIssues)}</span>
            <span className="button-count-badge">
              {intl.formatNumber(issues.length)}
            </span>
            <ChevronDownIcon
              className="disclosure-chevron"
              aria-hidden="true"
            />
          </Button>
          <Button
            buttonType="warning"
            disabled={!canManageIssues || !openIssueIds.length || busy}
            title={intl.formatMessage(messages.closeDescription)}
            disabledReason={
              !openIssueIds.length
                ? intl.formatMessage(messages.noOpenIssues)
                : undefined
            }
            onClick={() => {
              setIssueIds(openIssueIds);
              setAction('closeIssues');
            }}
          >
            <NoSymbolIcon aria-hidden="true" />
            <span>{intl.formatMessage(messages.closeIssues)}</span>
            <span className="button-count-badge">
              {intl.formatNumber(openIssueIds.length)}
            </span>
          </Button>
          <Button
            buttonType="danger"
            disabled={!canManageIssues || !issues.length || busy}
            title={intl.formatMessage(messages.deleteDescription)}
            disabledReason={
              !issues.length ? intl.formatMessage(messages.noIssues) : undefined
            }
            onClick={() => {
              setIssueIds(getManageIssueIds(issues, 'deleteIssues'));
              setAction('deleteIssues');
            }}
          >
            <TrashIcon aria-hidden="true" />
            {intl.formatMessage(messages.deleteIssues)}
          </Button>
        </div>
        <p className="manage-action-note">
          {intl.formatMessage(messages.issuesDescription)}
        </p>
        {issuesExpanded && canViewIssues && issues.length > 0 && (
          <ManageIssuesPanel
            issues={issues}
            id={issuesPanelId}
            label={intl.formatMessage(messages.viewIssues)}
            onUpdate={onUpdate}
          />
        )}
      </section>
      {(action === 'block' ||
        action === 'unblock' ||
        action === 'closeIssues' ||
        action === 'deleteIssues') && (
        <Transition show as="div">
          <Modal
            title={intl.formatMessage(
              action === 'block'
                ? messages.blockConfirm
                : action === 'unblock'
                  ? messages.unblockConfirm
                  : action === 'closeIssues'
                    ? messages.closeConfirm
                    : messages.deleteConfirm,
              { title, count: issueIds.length }
            )}
            okText={intl.formatMessage(
              action === 'unblock' ? messages.unblock : messages[action]
            )}
            onOk={() => void confirm()}
            cancelText={intl.formatMessage(messages.cancel)}
            okButtonType={action === 'closeIssues' ? 'warning' : 'danger'}
            okButtonProps={{
              buttonIcon: action === 'deleteIssues' ? 'delete' : undefined,
            }}
            cancelButtonType="success"
            loading={busy}
            okDisabled={busy}
            backgroundClickable={!busy}
            onCancel={busy ? undefined : () => setAction(null)}
            actionButtonSize="standard"
            dialogClass="app-card-main request-modal-site-surface refreshed-detail-text request-action-dialog"
          >
            <div className="card-stack">
              <p className="app-card-inset refreshed-inset-surface app-card-sub request-action-explanation">
                {displayTitle}
              </p>
              <p className="app-card-inset refreshed-inset-surface app-card-sub request-action-explanation">
                {intl.formatMessage(
                  action === 'block'
                    ? messages.blockDescription
                    : action === 'unblock'
                      ? messages.unblockDescription
                      : action === 'closeIssues'
                        ? messages.closeDescription
                        : messages.deleteDescription
                )}
              </p>
            </div>
          </Modal>
        </Transition>
      )}
      {action === 'clearAvailability' && availabilityQuality && libraryPlan && (
        <Transition show as="div">
          <Modal
            title={intl.formatMessage(messages.clearStaleAvailabilityTitle, {
              quality: availabilityQuality,
            })}
            okText={intl.formatMessage(messages.clearStaleAvailability, {
              quality: availabilityQuality,
            })}
            onOk={() => void confirm()}
            cancelText={intl.formatMessage(messages.cancel)}
            okButtonType="warning"
            okButtonProps={{}}
            cancelButtonType="success"
            loading={busy}
            okDisabled={
              busy ||
              !canClearStaleAvailability(
                media,
                mediaType,
                availabilityQuality,
                libraryPlan,
                libraryError
              )
            }
            backgroundClickable={!busy}
            onCancel={
              busy
                ? undefined
                : () => {
                    setAction(null);
                    setAvailabilityQuality(null);
                  }
            }
            actionButtonSize="standard"
            dialogClass="app-card-main request-modal-site-surface refreshed-detail-text request-action-dialog"
          >
            <div className="card-stack">
              <p className="app-card-inset refreshed-inset-surface app-card-sub request-action-explanation">
                {displayTitle}
              </p>
              <p className="app-card-inset refreshed-inset-surface app-card-sub request-action-explanation">
                {intl.formatMessage(
                  messages.clearStaleAvailabilityExplanation,
                  {
                    quality: availabilityQuality,
                    service: mediaType === MediaType.TV ? 'Sonarr' : 'Radarr',
                  }
                )}
              </p>
            </div>
          </Modal>
        </Transition>
      )}
      {action === 'remove' && confirmedLibrary && (
        <Transition show as="div">
          <RequestActionConfirmation
            action="remove"
            title={title}
            heading={intl.formatMessage(messages.removeAllTitle, { title })}
            explanation={intl.formatMessage(messages.removeAllDescription)}
            service={confirmedLibrary.targets
              .map((copy) => copy.service)
              .join(', ')}
            busy={busy}
            disabled={!confirmedLibrary.targets.length}
            onConfirm={() => void confirm()}
            onCancel={() => setAction(null)}
          >
            <ul className="app-card-inset refreshed-inset-surface app-card-sub request-action-explanation">
              {confirmedLibrary.targets.map((copy) => (
                <li key={copy.key}>
                  {displayTitle} — {copy.service} — {copy.quality}
                </li>
              ))}
            </ul>
          </RequestActionConfirmation>
        </Transition>
      )}
      {action === 'delete' && (
        <Transition show as="div">
          <RequestActionConfirmation
            action="delete"
            busy={busy}
            disabled={!request}
            onConfirm={() => void confirm()}
            onCancel={() => setAction(null)}
          >
            <label className="manage-action-selection">
              {intl.formatMessage(messages.selectRequest)}
              <select
                disabled={busy}
                value={requestId ?? ''}
                onChange={(event) => setRequestId(Number(event.target.value))}
              >
                {requests.map((item) => (
                  <option key={item.id} value={item.id}>
                    {intl.formatMessage(messages.requestOption, {
                      id: item.id,
                      user:
                        item.requestedBy?.displayName ??
                        intl.formatMessage(messages.unknownUser),
                      format:
                        mediaType === MediaType.BOOK
                          ? intl.formatMessage(
                              item.bookFormat === 'audiobook'
                                ? messages.audiobook
                                : item.bookFormat === 'both'
                                  ? messages.both
                                  : messages.ebook
                            )
                          : mediaType === MediaType.MUSIC
                            ? item.is4k
                              ? 'FLAC'
                              : 'MP3'
                            : item.is4k
                              ? '4K'
                              : 'HD',
                    })}
                  </option>
                ))}
              </select>
            </label>
          </RequestActionConfirmation>
        </Transition>
      )}
    </div>
  );
};

export default ManageMediaActions;
