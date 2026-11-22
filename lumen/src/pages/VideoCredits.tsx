import { Link, useParams } from 'react-router-dom';
import type { MovieDetails, TvDetails } from '../api';
import { People } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

export default function VideoCredits({ media }: { media: 'movie' | 'tv' }) {
  const { t } = useLumenLocale();
  const { id, credit } = useParams();
  const creditType = credit === 'cast' || credit === 'crew' ? credit : null;
  const path =
    id && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 1_000_000_000
      ? `/${media}/${id}`
      : null;
  const details = useApi<MovieDetails | TvDetails>(creditType ? path : null, {
    currentPathOnly: true,
  });
  const data = details.data;
  const people = creditType ? data?.credits?.[creditType] : undefined;
  return (
    <>
      <ExtraHeader
        title={
          creditType === 'cast'
            ? t('lumen.videoCredits.cast', 'Cast')
            : creditType === 'crew'
              ? t('lumen.videoCredits.crew', 'Crew')
              : t('lumen.videoCredits.credits', 'Credits')
        }
        sub={data?.title ?? data?.name}
      >
        {path && creditType && (
          <div className="toolbar">
            <Link className="chip" to={path}>
              {t('lumen.videoCredits.backToDetails', 'Back to Details')}
            </Link>
            <Link
              className="chip"
              to={`${path}/${creditType === 'cast' ? 'crew' : 'cast'}`}
            >
              {creditType === 'cast'
                ? t('lumen.videoCredits.viewCrew', 'View Crew')
                : t('lumen.videoCredits.viewCast', 'View Cast')}
            </Link>
          </div>
        )}
      </ExtraHeader>
      {(!path || !creditType) && (
        <p className="note">
          {t('lumen.videoCredits.invalid', 'This credits link is invalid.')}
        </p>
      )}
      <ServiceNote
        error={details.error}
        what={t('lumen.videoCredits.what', 'title credits')}
        retry={details.reload}
      />
      {path && creditType && !data && !details.error && (
        <p className="note" role="status">
          {t('lumen.videoCredits.loading', 'Loading credits…')}
        </p>
      )}
      {data &&
        (people?.length ? (
          <People list={people} full />
        ) : (
          <p className="note">
            {t('lumen.videoCredits.empty', 'No credits available.')}
          </p>
        ))}
    </>
  );
}
