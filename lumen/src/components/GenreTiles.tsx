import { Link } from 'react-router-dom';
import { tmdbImg, type Genre } from '../api';
import { useLumenLocale } from '../i18n';

export default function GenreTiles({
  genres,
  browse,
}: {
  genres: Genre[];
  browse: '/movies' | '/series';
}) {
  const { t } = useLumenLocale();
  const used = new Set<string>();
  return (
    <div className="genres">
      {genres.map(({ id, name, backdrops }) => {
        const images = backdrops
          .map((backdrop) => tmdbImg(backdrop, 'w780'))
          .filter(Boolean);
        const artwork = images.find((image) => !used.has(image)) ?? images[0];
        if (artwork) used.add(artwork);
        return (
          <Link
            key={id}
            className="genre"
            to={`${browse}?genre=${id}`}
            aria-label={t('lumen.accessibility.browseGenre', 'Browse {name}', {
              name,
            })}
          >
            {artwork && <img src={artwork} alt="" loading="lazy" />}
            <span>{name}</span>
          </Link>
        );
      })}
    </div>
  );
}
