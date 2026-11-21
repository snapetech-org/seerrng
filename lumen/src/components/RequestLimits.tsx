import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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
  const { t } = useLumenLocale();
  const quota = useApi<Quota>(`/user/${id}/quota`, { currentPathOnly: true });
  const shown = categories ?? (Object.keys(labels) as Category[]);
  return (
    <Section title={t('lumen.requestLimits.title', 'Request limits')}>
      <ServiceNote
        error={quota.error}
        what={t('lumen.requestLimits.lower', 'request limits')}
        title={t(
          'lumen.requestLimits.loadError',
          'Could not load request limits'
        )}
        retryLabel={t('lumen.account.retry', 'Retry')}
        retry={quota.reload}
      />
      {!quota.data && !quota.error && (
        <p className="note" role="status">
          {t('lumen.requestLimits.loading', 'Loading request limits…')}
        </p>
      )}
      <div className="quota">
        {shown.map((key) => {
          const limit = quota.data?.[key];
          if (!limit) return null;
          const maximum = limit.limit ?? 0;
          return (
            <div className="qbox" key={key}>
              <span>{t(`lumen.requestLimits.${key}`, labels[key])}</span>
              <b>
                {maximum > 0 ? (
                  <>
                    {Math.max(0, maximum - limit.used)}{' '}
                    <small>
                      {t('lumen.requestLimits.remaining', 'of {count} left', {
                        count: maximum,
                      })}
                    </small>
                  </>
                ) : (
                  t('lumen.requestLimits.noLimit', 'No limit')
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
                <span>
                  {t('lumen.requestLimits.period', 'Every {count} days', {
                    count: limit.days,
                  })}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
