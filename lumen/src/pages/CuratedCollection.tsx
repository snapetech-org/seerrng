import { Link, useParams, useSearchParams } from 'react-router-dom';
import { artUrl, tmdbImg, type MediaInfo } from '../api';
import { Section, TitleCard } from '../components/cards';
import { DetailTop } from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  extraStat,
  ServiceNote,
} from '../components/extra';
import { useApi } from '../hooks';

type Kind = 'tv' | 'music';
interface Collection {
  id: string;
  name: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  parts: {
    id: string;
    title: string;
    releaseDate?: string;
    posterPath?: string;
    primaryType?: string;
    mediaInfo?: MediaInfo;
    availableQualities?: ('MP3' | 'FLAC')[];
  }[];
}

function Content({ kind, id }: { kind: Kind; id: string }) {
  const [params] = useSearchParams();
  const collection = useApi<Collection>(
    `/collection-catalog/${kind}/${encodeURIComponent(id)}`
  );
  const data = collection.data;
  const music = kind === 'music';
  const returnAlbum = params.get('albumId');
  const albumId =
    returnAlbum &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(returnAlbum)
      ? returnAlbum
      : null;
  if (!data)
    return (
      <>
        <header className="ph">
          <h1>{music ? 'Discography' : 'Series Collection'}</h1>
        </header>
        <ServiceNote
          what="this collection"
          error={collection.error}
          retry={collection.reload}
        />
        {!collection.error && (
          <p className="note" role="status">
            Loading collection…
          </p>
        )}
      </>
    );

  const members = data.parts;
  const noun = music ? 'releases' : 'series';
  return (
    <article className="detail">
      <DetailTop
        title={data.name}
        poster={
          music ? artUrl(data.posterPath) : tmdbImg(data.posterPath, 'w500')
        }
        backdrop={
          music
            ? artUrl(data.backdropPath)
            : tmdbImg(data.backdropPath, 'w1280')
        }
        square={music}
        line={[`${members.length} ${noun}`]}
      />
      <div className="dbody">
        {albumId && music && (
          <Link className="btn btn-quiet btn-sm" to={`/music/${albumId}`}>
            Back to Album
          </Link>
        )}
        {data.overview && <p className="ov">{data.overview}</p>}
        <Section title={music ? 'Releases' : 'Series in This Collection'}>
          {members.length ? (
            <div className={music ? 'sqg grid' : 'grid'}>
              {members.map((part) =>
                music ? (
                  <ExtraCard
                    key={part.id}
                    title={part.title}
                    href={`/music/${encodeURIComponent(part.id)}`}
                    img={artUrl(part.posterPath)}
                    shape="sq"
                    icon="music"
                    stat={extraStat(part.mediaInfo)}
                    meta={[part.releaseDate?.slice(0, 4), part.primaryType]
                      .filter(Boolean)
                      .join(' · ')}
                    note={part.availableQualities?.join(' · ')}
                  />
                ) : (
                  <TitleCard
                    key={part.id}
                    it={{
                      id: Number(part.id),
                      name: part.title,
                      mediaType: 'tv',
                      firstAirDate: part.releaseDate,
                      posterPath: part.posterPath,
                      mediaInfo: part.mediaInfo,
                    }}
                  />
                )
              )}
            </div>
          ) : (
            <p className="note">No titles are available in this collection.</p>
          )}
        </Section>
      </div>
    </article>
  );
}

export default function CuratedCollection() {
  const { kind, id = '' } = useParams();
  if ((kind !== 'music' && kind !== 'tv') || !/^[a-z0-9_-]{1,128}$/i.test(id))
    return <p className="note">Collection not found.</p>;
  const content = <Content key={`${kind}:${id}`} kind={kind} id={id} />;
  return kind === 'music' ? (
    <ExtraGate k="music">{content}</ExtraGate>
  ) : (
    content
  );
}
