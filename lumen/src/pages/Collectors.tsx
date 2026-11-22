import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Cover } from '../components/cards';
import { ExtraGate, ExtraHeader, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

type Pick = {
  title: string;
  creator: string | null;
  year: number | null;
  trustedSourceCount: number;
  reasons: string[];
  album: { id: string; imageUrl?: string } | null;
  artistId: string | null;
};

const musicBrainzId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function CollectorPicks() {
  const { t } = useLumenLocale();
  const feed = useApi<{ available: boolean; results: Pick[] }>('/collectors');
  const toast = useToast();
  const [following, setFollowing] = useState<string[]>([]);
  const [saving, setSaving] = useState<string>();

  async function follow(artistId: string, artist: string) {
    setSaving(artistId);
    try {
      const result = await api<{ followId: number }>('/collectors/radar', {
        method: 'POST',
        body: JSON.stringify({ artistId, artist }),
      });
      if (!result?.followId)
        throw new Error(
          t('lumen.collectors.followNotConfirmed', 'Follow was not confirmed.')
        );
      setFollowing((current) => [...current, artistId]);
      toast(t('lumen.collectors.followedNotice', 'Artist followed.'));
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.collectors.followFailed', 'Could not follow the artist.'),
          t
        )
      );
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <>
      <ExtraHeader title={t('lumen.collectors.title', 'Collector Picks')} />
      <ServiceNote
        error={feed.error}
        what={t('lumen.collectors.what', 'collector picks')}
        retry={feed.reload}
      />
      {!feed.data && !feed.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {feed.data && !feed.data.available && (
        <p className="note">
          {t(
            'lumen.collectors.unavailable',
            'Collector picks require slskdN with social federation enabled.'
          )}
        </p>
      )}
      {feed.data?.available &&
        (feed.data.results.length ? (
          <ul className="setlist">
            {feed.data.results.map((pick) => {
              const artistId = pick.artistId?.toLowerCase();
              const albumId = pick.album?.id;
              const followed = artistId && following.includes(artistId);
              return (
                <li
                  className="set"
                  key={JSON.stringify([
                    pick.title,
                    pick.creator,
                    pick.year,
                    albumId,
                  ])}
                >
                  {pick.album?.imageUrl && (
                    <div className="poster sq" aria-hidden="true">
                      <div className="art">
                        <Cover
                          src={pick.album.imageUrl}
                          title={pick.title}
                          icon="music"
                        />
                      </div>
                    </div>
                  )}
                  <span>
                    <b>{pick.title}</b>
                    <small>
                      {[pick.creator, pick.year].filter(Boolean).join(' · ')}
                    </small>
                    <small>
                      {pick.trustedSourceCount === 1
                        ? t(
                            'lumen.collectors.sharedOne',
                            'Shared by {count} trusted collector',
                            { count: pick.trustedSourceCount }
                          )
                        : t(
                            'lumen.collectors.sharedMany',
                            'Shared by {count} trusted collectors',
                            { count: pick.trustedSourceCount }
                          )}
                    </small>
                    {pick.reasons.map((reason, index) => (
                      <small key={index}>{reason}</small>
                    ))}
                    {albumId && musicBrainzId.test(albumId) ? (
                      <Link className="go" to={`/music/${albumId}`}>
                        {t('lumen.collectors.openAlbum', 'Open Album')}
                      </Link>
                    ) : (
                      <small>
                        {t(
                          'lumen.collectors.noAlbum',
                          'No catalog album match'
                        )}
                      </small>
                    )}
                  </span>
                  {artistId && musicBrainzId.test(artistId) && pick.creator && (
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={!!saving || !!followed}
                      onClick={() => void follow(artistId, pick.creator!)}
                    >
                      {followed
                        ? t('lumen.collectors.following', 'Following')
                        : saving === artistId
                          ? t(
                              'lumen.collectors.followingProgress',
                              'Following…'
                            )
                          : t(
                              'lumen.collectors.followArtist',
                              'Follow Artist Releases'
                            )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="note">
            {t(
              'lumen.collectors.empty',
              'Nothing is being shared by collectors you follow yet.'
            )}
          </p>
        ))}
    </>
  );
}

export default function Collectors() {
  return (
    <ExtraGate k="music">
      <CollectorPicks />
    </ExtraGate>
  );
}
