import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tmdbImg, type Genre } from '../api';
import { useLumenLocale } from '../i18n';

function GenreTile({
  id,
  name,
  candidates,
  browse,
}: {
  id: number;
  name: string;
  candidates: string[];
  browse: '/movies' | '/series';
}) {
  const { t } = useLumenLocale();
  const [candidateIndex, setCandidateIndex] = useState(0);
  const artwork = candidates[candidateIndex];

  return (
    <Link
      className="genre"
      to={`${browse}?genre=${id}`}
      aria-label={t('lumen.accessibility.browseGenre', 'Browse {name}', {
        name,
      })}
    >
      {artwork && (
        <img
          src={artwork}
          alt=""
          loading="lazy"
          onError={() => setCandidateIndex((index) => index + 1)}
        />
      )}
      <span>{name}</span>
    </Link>
  );
}

export default function GenreTiles({
  genres,
  browse,
}: {
  genres: Genre[];
  browse: '/movies' | '/series';
}) {
  const used = new Set<string>();
  return (
    <div className="genres">
      {genres.map(({ id, name, backdrops }) => {
        const images = [
          ...new Set(
            backdrops
              .map((backdrop) => tmdbImg(backdrop, 'w780'))
              .filter(Boolean)
          ),
        ];
        const selected = images.find((image) => !used.has(image));
        const candidates = selected
          ? [selected, ...images.filter((image) => image !== selected)]
          : images;
        const artwork = candidates[0];
        if (artwork) used.add(artwork);
        return (
          <GenreTile
            key={id}
            id={id}
            name={name}
            candidates={candidates}
            browse={browse}
          />
        );
      })}
    </div>
  );
}
