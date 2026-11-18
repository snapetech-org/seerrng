import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ExtraGate, ExtraHeader, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

type Pick = {
  title: string;
  creator: string | null;
  year: number | null;
  trustedSourceCount: number;
  reasons: string[];
  album: { id: string } | null;
  artistId: string | null;
};

const musicBrainzId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function CollectorPicks() {
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
      if (!result?.followId) throw new Error('Follow was not confirmed.');
      setFollowing((current) => [...current, artistId]);
      toast('Artist followed.');
    } catch (error) {
      toast(friendlyError(error, 'Could not follow the artist.'));
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <>
      <ExtraHeader title="Collector Picks" />
      <ServiceNote
        error={feed.error}
        what="collector picks"
        retry={feed.reload}
      />
      {!feed.data && !feed.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {feed.data && !feed.data.available && (
        <p className="note">
          Collector picks require slskdN with social federation enabled.
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
                  <span>
                    <b>{pick.title}</b>
                    <small>
                      {[pick.creator, pick.year].filter(Boolean).join(' · ')}
                    </small>
                    <small>
                      Shared by {pick.trustedSourceCount} trusted{' '}
                      {pick.trustedSourceCount === 1
                        ? 'collector'
                        : 'collectors'}
                    </small>
                    {pick.reasons.map((reason, index) => (
                      <small key={index}>{reason}</small>
                    ))}
                    {albumId && musicBrainzId.test(albumId) ? (
                      <Link className="go" to={`/music/${albumId}`}>
                        Open Album
                      </Link>
                    ) : (
                      <small>No catalog album match</small>
                    )}
                  </span>
                  {artistId && musicBrainzId.test(artistId) && pick.creator && (
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={!!saving || !!followed}
                      onClick={() => void follow(artistId, pick.creator!)}
                    >
                      {followed
                        ? 'Following'
                        : saving === artistId
                          ? 'Following…'
                          : 'Follow Artist Releases'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="note">
            Nothing is being shared by collectors you follow yet.
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
