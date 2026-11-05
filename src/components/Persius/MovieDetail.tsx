import CachedImage from '@app/components/Common/CachedImage';
import MetadataAttribution from '@app/components/MediaDetails/MetadataAttribution';
import type { MovieDetails } from '@server/models/Movie';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { avatarTone, calendarDate, duration, initials } from './format';
import messages from './messages';

export interface MovieDetailProps {
  data: MovieDetails;
  requestAction: ReactNode;
  trailerAction?: ReactNode;
  playbackActions?: ReactNode;
  tools?: ReactNode;
  ratings?: ReactNode;
}

export default function MovieDetail({
  data,
  requestAction,
  trailerAction,
  playbackActions,
  tools,
  ratings,
}: MovieDetailProps) {
  const intl = useIntl();
  const date = calendarDate(data.releaseDate);
  const directors = data.credits.crew.filter(
    (person) => person.job === 'Director'
  );
  const facts = [
    [intl.formatMessage(messages.runtime), duration(data.runtime)],
    [
      intl.formatMessage(messages.released),
      date ? intl.formatDate(date, { dateStyle: 'medium' }) : undefined,
    ],
    [
      intl.formatMessage(messages.director),
      directors.map((person) => person.name).join(', '),
    ],
    [
      intl.formatMessage(messages.genres),
      data.genres.map((genre) => genre.name).join(', '),
    ],
  ];
  return (
    <article className="persius-detail" data-media-type="movie">
      <header className="persius-detail-hero">
        {data.backdropPath && (
          <CachedImage
            type="tmdb"
            src={`https://image.tmdb.org/t/p/original${data.backdropPath}`}
            alt=""
            fill
            priority
            sizes="1320px"
            className="persius-detail-backdrop"
          />
        )}
        <div className="persius-detail-identity">
          <div className="persius-detail-poster">
            <CachedImage
              type="tmdb"
              src={
                data.posterPath
                  ? `https://image.tmdb.org/t/p/w500${data.posterPath}`
                  : '/images/seerr_poster_not_found.png'
              }
              alt=""
              fill
              priority
              sizes="220px"
            />
          </div>
          <div>
            <h1 className="page-title" data-testid="media-title">
              {data.title}
            </h1>
            <p className="persius-detail-meta">
              {[
                data.releaseDate?.slice(0, 4),
                duration(data.runtime),
                data.genres.map((genre) => genre.name).join(', '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </header>
      <div className="persius-detail-ratings">{ratings}</div>
      <div className="persius-detail-actions">
        <div>{requestAction}</div>
        {trailerAction && <div>{trailerAction}</div>}
      </div>
      {playbackActions && (
        <div className="persius-detail-playback">{playbackActions}</div>
      )}
      <div className="persius-detail-columns">
        <section>
          {data.tagline && <p className="persius-tagline">{data.tagline}</p>}
          {data.overview && <p className="persius-overview">{data.overview}</p>}
          <MetadataAttribution sources={data.metadataSources} />
          {data.credits.cast.length > 0 && (
            <>
              <h2 className="page-heading">
                {intl.formatMessage(messages.starring)}
              </h2>
              <div className="persius-cast">
                {data.credits.cast.slice(0, 12).map((person) => (
                  <Link
                    href={`/person/${person.id}`}
                    className="persius-person"
                    key={`${person.id}:${person.creditId}`}
                  >
                    <span
                      className="persius-avatar"
                      data-tone={avatarTone(person.name)}
                    >
                      {initials(person.name)}
                    </span>
                    {person.name}
                  </Link>
                ))}
              </div>
            </>
          )}
          <details className="persius-secondary">
            <summary>{intl.formatMessage(messages.details)}</summary>
            <div className="persius-tools">{tools}</div>
          </details>
        </section>
        <dl className="persius-facts">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </div>
    </article>
  );
}
