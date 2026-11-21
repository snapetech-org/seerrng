import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, tmdbImg, type RequestItem } from '../api';
import { isAdministrator, useAuth, useMediaServerName } from '../auth';
import AvatarContent from '../components/AvatarContent';
import { Section, shortDate } from '../components/cards';
import { canManageRequests, canViewAllRequests } from '../components/detail';
import { ExtraCard, ExtraHeader, ServiceNote } from '../components/extra';
import RequestLimits from '../components/RequestLimits';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { describeAll, requestRowStatus, RequestStatusPills } from './Requests';
import { canViewUserWatchlist, itemId, type WatchlistData } from './Watchlist';

const avatarTypes = ['image/jpeg', 'image/png', 'image/webp'];

function ProfilePictureUpload({
  id,
  saved,
}: {
  id: number;
  saved: () => void;
}) {
  const { t } = useLumenLocale();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(file?: File) {
    if (!file || pending.current) return;
    if (!avatarTypes.includes(file.type)) {
      setError(
        t(
          'lumen.householdProfile.pictureFormatError',
          'Choose a JPEG, PNG, or WebP image.'
        )
      );
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setError(
        t(
          'lumen.householdProfile.pictureSizeError',
          'Choose a nonempty picture no larger than 5 MB.'
        )
      );
      return;
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/user/${id}/avatar`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (generation === sessionGeneration()) saved();
    } catch (cause) {
      if (generation === sessionGeneration())
        setError(
          friendlyError(
            cause,
            t(
              'lumen.householdProfile.pictureUpdateError',
              'Could not update profile picture.'
            )
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={avatarTypes.join(',')}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void upload(file);
        }}
      />
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy
          ? t('lumen.householdProfile.uploadingPicture', 'Uploading Picture…')
          : t('lumen.householdProfile.changePicture', 'Change Profile Picture')}
      </button>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function RecentRequests({ id, own }: { id: number; own: boolean }) {
  const { t } = useLumenLocale();
  const serverName = useMediaServerName();
  const requestScope = own ? 'tab=all' : `requestedBy=${id}`;
  const requests = useApi<{ results: RequestItem[] }>(
    `/user/${id}/requests?take=10&skip=0`,
    { currentPathOnly: true }
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof describeAll>>>();
  const [descriptionError, setDescriptionError] = useState(false);
  const results = Array.isArray(requests.data?.results)
    ? requests.data.results
    : undefined;
  const error =
    requests.error ||
    (requests.data && !results
      ? t(
          'lumen.householdProfile.invalidRequests',
          'Invalid recent requests response.'
        )
      : null) ||
    (descriptionError
      ? t(
          'lumen.householdProfile.requestTitlesError',
          'Could not load request titles.'
        )
      : null);
  useEffect(() => {
    let active = true;
    if (results) {
      setDescriptionError(false);
      const update = (result: Awaited<ReturnType<typeof describeAll>>) => {
        if (active) setRows(result);
      };
      void describeAll(results, update)
        .then(update)
        .catch(() => {
          if (active) setDescriptionError(true);
        });
    }
    return () => {
      active = false;
    };
  }, [results]);

  return (
    <Section
      title={t('lumen.householdProfile.recentRequests', 'Recent Requests')}
    >
      <ServiceNote
        error={error}
        what={t(
          'lumen.householdProfile.recentRequestsLower',
          'recent requests'
        )}
        title={t(
          'lumen.householdProfile.requestsLoadError',
          'Could not load recent requests'
        )}
        retryLabel={t('lumen.account.retry', 'Retry')}
        retry={requests.reload}
      />
      {!error && !rows && (
        <p className="note" role="status">
          {t('lumen.householdProfile.loadingRequests', 'Loading requests…')}
        </p>
      )}
      {results && rows?.length === 0 && (
        <p className="note">
          {t('lumen.householdProfile.noRequests', 'No requests yet.')}
        </p>
      )}
      {results && !!rows?.length && (
        <ul className="setlist">
          {rows.map((row) => {
            const { r, title, sub } = row;
            const status = requestRowStatus(row, serverName);
            return (
              <li className="set" key={r.id}>
                <div>
                  <Link
                    className="go"
                    to={`/requests?${requestScope}&requestId=${r.id}`}
                  >
                    {title}
                  </Link>
                  {sub && <small>{sub}</small>}
                </div>
                <RequestStatusPills request={r} status={status} />
              </li>
            );
          })}
        </ul>
      )}
      <Link className="btn btn-quiet btn-sm" to={`/requests?${requestScope}`}>
        {t('components.PermissionEdit.viewrequests', 'View Requests')}
      </Link>
    </Section>
  );
}

function WatchlistPreview({ id, own }: { id: number; own: boolean }) {
  const { t } = useLumenLocale();
  const watchlist = useApi<WatchlistData>(`/user/${id}/watchlist`, {
    currentPathOnly: true,
  });
  const items = Array.isArray(watchlist.data?.results)
    ? watchlist.data.results
    : undefined;
  const error =
    watchlist.error ||
    (watchlist.data && !items
      ? t(
          'lumen.householdProfile.invalidWatchlist',
          'Invalid watchlist response.'
        )
      : null);
  return (
    <Section title={t('lumen.householdProfile.watchlist', 'Watchlist')}>
      <ServiceNote
        error={error}
        what={t('lumen.householdProfile.watchlistLower', 'watchlist')}
        title={t(
          'lumen.householdProfile.watchlistLoadError',
          'Could not load watchlist'
        )}
        retryLabel={t('lumen.account.retry', 'Retry')}
        retry={watchlist.reload}
      />
      {!error && !items && (
        <p className="note" role="status">
          {t('lumen.householdProfile.loadingWatchlist', 'Loading watchlist…')}
        </p>
      )}
      {items?.length === 0 && (
        <p className="note">
          {t(
            'lumen.householdProfile.noWatchlistTitles',
            'No titles on this watchlist.'
          )}
        </p>
      )}
      {!!items?.length && (
        <ul className="setlist">
          {items.slice(0, 10).map((item) => {
            const key = itemId(item);
            return (
              <li className="set" key={`${item.mediaType}:${item.ratingKey}`}>
                {key ? (
                  <Link
                    className="go"
                    to={`/${item.mediaType}/${encodeURIComponent(key)}`}
                  >
                    {item.title}
                  </Link>
                ) : (
                  <b>{item.title}</b>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        className="btn btn-quiet btn-sm"
        to={own ? '/watchlist' : `/watchlist/user/${id}`}
      >
        {t('lumen.householdProfile.viewWatchlist', 'View Watchlist')}
      </Link>
    </Section>
  );
}

function PlaybackActivity({ id }: { id: number }) {
  const { locale, t } = useLumenLocale();
  const activity = useApi<{
    playCount: number;
    recentlyWatched: {
      id: number;
      tmdbId: number;
      mediaType: 'movie' | 'tv';
      searchMetadata?: { title?: string | null; posterPath?: string | null };
    }[];
  }>(`/user/${id}/watch_data`, { currentPathOnly: true });

  if (activity.errorStatus === 404) return null;

  const data =
    activity.data &&
    Number.isSafeInteger(activity.data.playCount) &&
    activity.data.playCount >= 0 &&
    Array.isArray(activity.data.recentlyWatched)
      ? activity.data
      : null;
  const error =
    activity.error ||
    (activity.data && !data
      ? t(
          'lumen.householdProfile.invalidPlayback',
          'Invalid playback activity response.'
        )
      : null);
  const watched = data?.recentlyWatched.filter(
    ({ mediaType, tmdbId }) =>
      (mediaType === 'movie' || mediaType === 'tv') &&
      Number.isSafeInteger(tmdbId) &&
      tmdbId > 0
  );

  return (
    <Section
      title={t('lumen.householdProfile.playbackActivity', 'Playback Activity')}
    >
      <ServiceNote
        error={error}
        what={t(
          'lumen.householdProfile.playbackActivityLower',
          'playback activity'
        )}
        title={t(
          'lumen.householdProfile.playbackLoadError',
          'Could not load playback activity'
        )}
        retryLabel={t('lumen.account.retry', 'Retry')}
        retry={activity.reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t(
            'lumen.householdProfile.loadingPlayback',
            'Loading playback activity…'
          )}
        </p>
      )}
      {data && (
        <>
          <p className="note">
            {t('lumen.householdProfile.totalPlays', 'Total plays: {count}', {
              count: data.playCount.toLocaleString(locale),
            })}
          </p>
          {watched?.length ? (
            <div
              className="rail"
              aria-label={t(
                'lumen.householdProfile.recentlyWatched',
                'Recently watched'
              )}
            >
              {watched.map(
                ({ id: mediaId, tmdbId, mediaType, searchMetadata }) => (
                  <ExtraCard
                    key={mediaId}
                    href={`/${mediaType}/${tmdbId}`}
                    img={tmdbImg(searchMetadata?.posterPath)}
                    title={
                      searchMetadata?.title ||
                      (mediaType === 'movie'
                        ? t('lumen.householdProfile.movie', 'Movie')
                        : t('lumen.householdProfile.series', 'Series'))
                    }
                    icon={mediaType === 'movie' ? 'film' : 'tv'}
                    titleKind={mediaType}
                  />
                )
              )}
            </div>
          ) : (
            <p className="note">
              {t(
                'lumen.householdProfile.noRecentlyWatched',
                'No recently watched titles to display.'
              )}
            </p>
          )}
        </>
      )}
    </Section>
  );
}

export default function HouseholdProfile() {
  const { locale, t } = useLumenLocale();
  const { id: rawId = '' } = useParams();
  const { user, refresh } = useAuth();
  const id =
    rawId === 'me'
      ? (user?.id ?? 0)
      : /^[1-9]\d{0,9}$/.test(rawId)
        ? Number(rawId)
        : 0;
  const valid = id > 0 && id <= 1_000_000_000;
  const profile = useApi<{
    id: number;
    displayName: string;
    createdAt?: string;
    email?: string;
    avatar?: string;
    userType?: number;
  }>(valid ? `/user/${id}` : null, { currentPathOnly: true });
  const own = user?.id === id;
  const permissions = user?.permissions ?? 0;
  const canViewQuota =
    own || ((permissions & (2 | 8)) !== 0 && (permissions & (2 | 16)) !== 0);
  const loaded = profile.data?.id === id;
  const joined = loaded ? shortDate(profile.data?.createdAt, true, locale) : '';
  const canEdit = own || (id !== 1 && (permissions & (2 | 8)) !== 0);
  const email =
    loaded && (own || (permissions & (2 | 8)) !== 0)
      ? profile.data?.email
      : undefined;
  const subtitle = [
    email &&
      email.toLowerCase() !== profile.data?.displayName.toLowerCase() &&
      email,
    joined &&
      t('lumen.householdProfile.joined', 'Joined {date}', { date: joined }),
    loaded &&
      canManageRequests(permissions) &&
      t('lumen.householdProfile.userId', 'User ID: {id}', { id }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <ExtraHeader
        title={
          loaded
            ? profile.data!.displayName
            : t('lumen.householdProfile.title', 'Household Profile')
        }
        sub={subtitle}
        leading={
          loaded && (
            <span className="avatar" aria-hidden="true">
              <AvatarContent
                key={id}
                name={profile.data!.displayName}
                avatar={profile.data!.avatar}
              />
            </span>
          )
        }
      >
        {loaded && own && profile.data?.userType === 2 && (
          <ProfilePictureUpload
            key={id}
            id={id}
            saved={() => {
              profile.reload();
              void refresh();
            }}
          />
        )}
        {loaded && canEdit && (
          <Link
            className="btn btn-quiet btn-sm"
            to={own ? '/me/account' : `/admin/users/${id}`}
          >
            {t('lumen.householdProfile.editSettings', 'Edit Settings')}
          </Link>
        )}
      </ExtraHeader>
      {!valid && (
        <p className="note">
          {t('lumen.householdProfile.invalidUserId', 'Invalid user ID.')}
        </p>
      )}
      <ServiceNote
        error={profile.error}
        what={t('lumen.householdProfile.profileLower', 'household profile')}
        title={t(
          'lumen.householdProfile.profileLoadError',
          'Could not load household profile'
        )}
        retryLabel={t('lumen.account.retry', 'Retry')}
        retry={profile.reload}
      />
      {valid && !profile.data && !profile.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {loaded && (
        <>
          {canViewQuota && <RequestLimits key={id} id={id} />}
          {profile.data?.userType === 1 &&
            (own || isAdministrator(permissions)) && (
              <PlaybackActivity key={id} id={id} />
            )}
          {(own || canViewAllRequests(user?.permissions)) && (
            <RecentRequests key={id} id={id} own={own} />
          )}
          {(own || canViewUserWatchlist(user?.permissions ?? 0)) && (
            <WatchlistPreview key={id} id={id} own={own} />
          )}
        </>
      )}
    </>
  );
}
