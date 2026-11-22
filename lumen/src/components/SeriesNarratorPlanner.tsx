import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { canManageRequests } from './detail';
import { ServiceNote } from './extra';
import FollowButton from './FollowButton';
import { useToast } from './toast';

interface NarratorPlan {
  narrator: string;
  production: 'solo' | 'full-cast' | 'unknown';
  covered: number[];
  missing: number[];
  owned: number[];
  totalBooks: number;
  complete: boolean;
  otherPerformanceOnly: number[];
}

interface NarratorResponse {
  supported: boolean;
  matrix?: { books: { bookId: number; title: string }[] };
  plans: NarratorPlan[];
}

export default function SeriesNarratorPlanner({ title }: { title: string }) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const pending = useRef(false);
  const [saving, setSaving] = useState('');
  const publicSettings = useApi<{
    enabledMediaCategories?: Record<string, boolean>;
  }>('/settings/public');
  const accountSettings = useApi<{
    enabledMediaCategories?: Record<string, boolean>;
  }>(user ? `/user/${user.id}/settings/main` : null);
  const settingsReady =
    !!publicSettings.data && (!user || !!accountSettings.data);
  const audiobookEnabled =
    settingsReady &&
    publicSettings.data?.enabledMediaCategories?.audiobook !== false &&
    accountSettings.data?.enabledMediaCategories?.audiobook !== false;
  const query = new URLSearchParams({ title });
  const { data, error, reload } = useApi<NarratorResponse>(
    audiobookEnabled ? `/editions/series-narrators?${query}` : null
  );
  const canCollect = canManageRequests(user?.permissions);

  async function collect(narrator: string) {
    if (pending.current) return;
    pending.current = true;
    setSaving(narrator);
    try {
      await api('/editions/series-narrators/prefer', {
        method: 'POST',
        body: JSON.stringify({ title, narrator }),
      });
      toast(
        t('lumen.seriesNarrators.saved', 'The series now prefers {narrator}.', {
          narrator,
        })
      );
    } catch (failure) {
      toast(
        friendlyError(
          failure,
          t(
            'lumen.seriesNarrators.saveFailed',
            'The narrator preference could not be saved.'
          ),
          t
        )
      );
    } finally {
      pending.current = false;
      setSaving('');
    }
  }

  const heading = t(
    'lumen.seriesNarrators.heading',
    'Collect This Series With One Narrator'
  );
  if (!audiobookEnabled) return null;
  if (error && !data)
    return (
      <Section title={heading}>
        <ServiceNote
          what={t('lumen.seriesNarrators.what', 'narrator comparison')}
          title={t(
            'lumen.seriesNarrators.loadFailed',
            'Narrator comparison could not be loaded.'
          )}
          error={error}
          retryLabel={t('lumen.common.retry', 'Retry')}
          retry={reload}
        />
      </Section>
    );
  if (!data?.supported || !data.plans.length) return null;

  const titles = new Map(
    data.matrix?.books.map((book) => [book.bookId, book.title])
  );

  return (
    <Section title={heading}>
      <p className="note">
        {t(
          'lumen.seriesNarrators.description',
          'Compare which volumes are available with each audiobook narrator, then follow or prefer a performance.'
        )}
      </p>
      <ul className="setlist">
        {data.plans.map((plan) => (
          <li className="set" key={plan.narrator}>
            <div>
              <div className="chips wrap">
                <b>{plan.narrator}</b>
                {plan.production === 'full-cast' && (
                  <span className="chip">
                    {t('lumen.seriesNarrators.fullCast', 'Full Cast')}
                  </span>
                )}
                {plan.complete && (
                  <span className="chip">
                    {t('lumen.seriesNarrators.complete', 'Complete Set')}
                  </span>
                )}
              </div>
              <p>
                {t(
                  'lumen.seriesNarrators.covered',
                  '{covered} of {total} volumes',
                  { covered: plan.covered.length, total: plan.totalBooks }
                )}
              </p>
              {!!plan.owned.length && (
                <small>
                  {t('lumen.seriesNarrators.owned', '{count} already owned', {
                    count: plan.owned.length,
                  })}
                </small>
              )}
              {!!plan.missing.length && (
                <>
                  <p>
                    {t(
                      'lumen.seriesNarrators.missing',
                      '{count} volumes missing',
                      { count: plan.missing.length }
                    )}
                    {': '}
                    {plan.missing
                      .map((id) => titles.get(id))
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {!!plan.otherPerformanceOnly.length && (
                    <small>
                      {t(
                        'lumen.seriesNarrators.otherPerformance',
                        '{count} volumes only exist with another narrator',
                        { count: plan.otherPerformanceOnly.length }
                      )}
                    </small>
                  )}
                  <p>
                    {t(
                      'lumen.seriesNarrators.waitOrPrefer',
                      'You can wait for missing volumes in this narration, or accept another narrator for them.'
                    )}
                  </p>
                </>
              )}
              <div className="toolbar">
                {canCollect && (
                  <button
                    className="btn btn-tonal btn-sm"
                    type="button"
                    disabled={!!saving}
                    onClick={() => void collect(plan.narrator)}
                  >
                    {t(
                      'lumen.seriesNarrators.collect',
                      'Collect With {narrator}',
                      { narrator: plan.narrator }
                    )}
                  </button>
                )}
                <FollowButton
                  label={t(
                    'lumen.seriesNarrators.follow',
                    'Follow {narrator}',
                    { narrator: plan.narrator }
                  )}
                  subject={{
                    kind: 'narrator',
                    subjectKey: `narrator:${plan.narrator.toLowerCase()}`,
                    subjectLabel: plan.narrator,
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
