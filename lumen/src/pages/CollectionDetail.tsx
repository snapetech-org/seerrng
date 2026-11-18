import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, MediaStatus, tmdbImg } from '../api';
import { useAuth } from '../auth';
import { canManageBlocklist, notifyBlocklistChanged } from '../blocklist';
import { Section, TitleCard } from '../components/cards';
import CollectionQueueSheet from '../components/CollectionQueueSheet';
import CollectionRequestSheet, {
  type MovieCollection,
} from '../components/CollectionRequestSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canRequest4k,
  canRequestMovies,
  DetailTop,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { useApi, usePublicSettings } from '../hooks';

function CollectionContent({ id }: { id: number }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, reload, refresh } = useApi<MovieCollection>(
    `/collection/${id}`
  );
  const [confirm, setConfirm] = useState<'add' | 'remove'>();
  const settings = usePublicSettings();
  const [requestOpen, setRequestOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const qualities: ('hd' | '4k')[] = [];
  if (canRequestMovies(user?.permissions)) qualities.push('hd');
  if (settings?.movie4kEnabled && canRequest4k(user?.permissions, 'movie'))
    qualities.push('4k');
  const manager = canManageBlocklist(user?.permissions);
  const blocked =
    data?.parts.filter(
      (part) => part.mediaInfo?.status === MediaStatus.BLOCKLISTED
    ).length ?? 0;
  const action = blocked ? 'remove' : 'add';

  async function apply() {
    if (
      !manager ||
      !data?.parts.length ||
      data.id !== id ||
      confirm !== action ||
      working.current
    )
      return;
    working.current = true;
    setBusy(true);
    try {
      await api<void>(
        `/blocklist/collection/${id}`,
        { method: action === 'add' ? 'POST' : 'DELETE' },
        'empty'
      );
      refresh();
      toast(
        action === 'add'
          ? 'Collection added to the Blocklist.'
          : 'Collection removed from the Blocklist.'
      );
    } catch {
      reload();
      toast(
        'Could not confirm the change. Check the collection before trying again.'
      );
    } finally {
      notifyBlocklistChanged();
      setConfirm(undefined);
      working.current = false;
      setBusy(false);
    }
  }

  if (error)
    return <ServiceNote error={error} what="this collection" retry={reload} />;
  if (!data)
    return (
      <p className="note" role="status">
        Loading collection…
      </p>
    );
  if (data.id !== id) return <p className="note">Collection not found.</p>;
  const title =
    action === 'add' ? 'Blocklist Collection' : 'Unblock Collection';

  return (
    <article className="detail">
      <DetailTop
        title={data.name}
        poster={tmdbImg(data.posterPath, 'w500')}
        backdrop={tmdbImg(data.backdropPath, 'w1280')}
        line={[
          `${data.parts.length} ${data.parts.length === 1 ? 'movie' : 'movies'}`,
        ]}
      />
      <div className="dbody">
        {data.parts.length > 0 && (
          <div className="dstatus">
            {qualities.length > 0 && (
              <button
                className="btn btn-tonal btn-sm"
                onClick={() => setRequestOpen(true)}
              >
                Request Collection
              </button>
            )}
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => setQueueOpen(true)}
            >
              Queue Collection
            </button>
            {blocked > 0 && (
              <span className="dnote">
                {blocked} of {data.parts.length} blocklisted
              </span>
            )}
            {manager && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirm(action)}
              >
                {title}
              </button>
            )}
          </div>
        )}
        {data.overview && <p className="ov">{data.overview}</p>}
        <Section title="Movies">
          {data.parts.length ? (
            <div className="grid">
              {data.parts.map((part) => (
                <TitleCard key={part.id} it={part} />
              ))}
            </div>
          ) : (
            <p className="note">No movies listed.</p>
          )}
        </Section>
      </div>
      {requestOpen && (
        <CollectionRequestSheet
          collection={data}
          qualities={qualities}
          permissions={user?.permissions}
          close={(submitted) => {
            setRequestOpen(false);
            if (submitted) reload();
          }}
        />
      )}
      {queueOpen && (
        <CollectionQueueSheet
          id={id}
          title={data.name}
          close={() => {
            setQueueOpen(false);
            reload();
          }}
        />
      )}
      {confirm && (
        <ConfirmSheet
          title={
            confirm === 'add'
              ? 'Blocklist this collection?'
              : 'Unblock this collection?'
          }
          body={
            confirm === 'add'
              ? 'New requests for all movies in this collection will be blocked.'
              : 'This removes Blocklist entries for all movies in this collection, including individually blocked movies.'
          }
          confirm={title}
          busy={busy}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!working.current) setConfirm(undefined);
          }}
        />
      )}
    </article>
  );
}

export default function CollectionDetail() {
  const { id = '' } = useParams();
  const number = /^\d+$/.test(id) ? Number(id) : 0;
  return Number.isSafeInteger(number) &&
    number > 0 &&
    number <= 1_000_000_000 ? (
    <CollectionContent key={number} id={number} />
  ) : (
    <p className="note">Collection not found.</p>
  );
}
