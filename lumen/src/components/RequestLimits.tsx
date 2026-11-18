import { useApi } from '../hooks';
import { Section } from './cards';
import { ServiceNote } from './extra';

const labels = {
  movie: 'Movies',
  tv: 'Seasons',
  book: 'Books',
  music: 'Music',
  comic: 'Comics',
  magazine: 'Magazines',
  adult: 'Adult',
  software: 'Software',
};

type Category = keyof typeof labels;
type Quota = Partial<
  Record<Category, { limit?: number; used: number; days?: number }>
>;

export default function RequestLimits({
  id,
  categories,
}: {
  id: number;
  categories?: Category[];
}) {
  const quota = useApi<Quota>(`/user/${id}/quota`, { currentPathOnly: true });
  const shown = categories ?? (Object.keys(labels) as Category[]);
  return (
    <Section title="Request limits">
      <ServiceNote
        error={quota.error}
        what="request limits"
        retry={quota.reload}
      />
      {!quota.data && !quota.error && (
        <p className="note" role="status">
          Loading request limits…
        </p>
      )}
      <div className="quota">
        {shown.map((key) => {
          const limit = quota.data?.[key];
          if (!limit) return null;
          const maximum = limit.limit ?? 0;
          return (
            <div className="qbox" key={key}>
              <span>{labels[key]}</span>
              <b>
                {maximum > 0 ? (
                  <>
                    {Math.max(0, maximum - limit.used)}{' '}
                    <small>of {maximum} left</small>
                  </>
                ) : (
                  'No limit'
                )}
              </b>
              {maximum > 0 && (
                <div className="progress">
                  <i
                    style={{
                      width: `${Math.min(100, (limit.used / maximum) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {maximum > 0 && limit.days ? (
                <span>Every {limit.days} days</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
