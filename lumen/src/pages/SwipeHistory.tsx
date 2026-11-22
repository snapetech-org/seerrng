import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

interface Decision {
  mediaType: string;
  id: string;
  title: string;
  decision: 'want' | 'pass' | 'seen';
}
const endpoint = '/swipe/history';

export default function SwipeHistory({ categories }: { categories: string[] }) {
  const { t } = useLumenLocale();
  const labels: Record<string, string> = {
    movie: t('lumen.swipeHistory.category.movies', 'Movies'),
    tv: t('lumen.swipeHistory.category.series', 'Series'),
    book: t('lumen.swipeHistory.category.books', 'Books'),
    audiobook: t('lumen.swipeHistory.category.audiobooks', 'Audiobooks'),
    comic: t('lumen.swipeHistory.category.comics', 'Comics'),
    magazine: t('lumen.swipeHistory.category.magazines', 'Magazines'),
    music: t('lumen.swipeHistory.category.music', 'Music'),
    sports: t('lumen.swipeHistory.category.sports', 'Sports'),
    adult: t('lumen.swipeHistory.category.adult', 'Adult'),
    'software-retro': t(
      'lumen.swipeHistory.category.retroGames',
      'Retro Games'
    ),
    'software-modern': t('lumen.swipeHistory.category.apps', 'Apps'),
    'software-game': t('lumen.swipeHistory.category.games', 'Games'),
  };
  const [category, setCategory] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const path = category
    ? `${endpoint}?mediaType=${encodeURIComponent(category)}`
    : endpoint;
  const history = useApi<{ decisions: Decision[]; hasMore: boolean }>(path, {
    currentPathOnly: true,
  });
  const decisions = history.data?.decisions;

  async function change(item?: Decision) {
    if (pending.current || (!item && !confirm)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = sessionGeneration();
    try {
      if (item) {
        await api(endpoint + '/restore', {
          method: 'POST',
          body: JSON.stringify({ mediaType: item.mediaType, id: item.id }),
        });
      } else {
        const result = await api<{ cleared: number }>(path, {
          method: 'DELETE',
        });
        if (generation === sessionGeneration())
          setNotice(
            t('lumen.swipeHistory.clearedCount', 'Cleared {count} decisions.', {
              count: result.cleared,
            })
          );
      }
      if (generation !== sessionGeneration()) return;
      if (item)
        setNotice(
          t('lumen.swipeHistory.restoreSuccess', '{title} restored.', {
            title: item.title,
          })
        );
      setConfirm(false);
      history.reload();
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.swipeHistory.updateError',
                'Could not update Swipe history.'
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title={t('lumen.swipeHistory.title', 'Swipe History')}>
      <div className="setlist">
        <label className="set cfg-row">
          <span>{t('lumen.swipeHistory.category', 'History Category')}</span>
          <select
            className="cfg-select"
            value={category}
            disabled={busy}
            onChange={(event) => {
              setCategory(event.target.value);
              setConfirm(false);
              setError('');
              setNotice('');
            }}
          >
            <option value="">
              {t('lumen.swipeHistory.allCategories', 'All Categories')}
            </option>
            {categories.map((type) => (
              <option key={type} value={type}>
                {labels[type] ?? type}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ServiceNote
        what={t('lumen.swipeHistory.what', 'Swipe history')}
        error={history.error}
        retry={history.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!decisions && !history.error && (
        <p className="note" role="status">
          {t('lumen.swipeHistory.loading', 'Loading Swipe history…')}
        </p>
      )}
      {decisions?.length === 0 && (
        <p className="note">
          {t('lumen.swipeHistory.empty', 'No decisions in this category.')}
        </p>
      )}
      {history.data?.hasMore && (
        <p className="note">
          {t(
            'lumen.swipeHistory.latestLimit',
            'Showing the latest 200 decisions.'
          )}
        </p>
      )}
      <div className="setlist">
        {decisions?.map((item) => (
          <div className="set cfg-row" key={`${item.mediaType}:${item.id}`}>
            <span>
              <b>{item.title}</b>
              <small>
                {item.decision === 'want'
                  ? t('lumen.swipeHistory.requested', 'Requested')
                  : item.decision === 'pass'
                    ? t('lumen.swipeHistory.passed', 'Passed')
                    : t('lumen.swipeHistory.seenOrRead', 'Seen or Read')}
              </small>
            </span>
            {item.decision === 'want' ? (
              <Link to="/requests" className="btn btn-quiet btn-sm">
                {t('lumen.swipeHistory.viewRequests', 'View Requests')}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={t(
                  'lumen.swipeHistory.restoreTitle',
                  'Restore {title}',
                  { title: item.title }
                )}
                disabled={busy}
                onClick={() => void change(item)}
              >
                {t('lumen.swipeHistory.restore', 'Restore')}
              </button>
            )}
          </div>
        ))}
      </div>
      {decisions?.some(({ decision }) => decision !== 'want') && (
        <div className="toolbar">
          {confirm ? (
            <>
              <p className="note">
                {category
                  ? t(
                      'lumen.swipeHistory.confirmClearCategory',
                      'Clear passed, seen, and read titles from {category}?',
                      { category: labels[category] ?? category }
                    )
                  : t(
                      'lumen.swipeHistory.confirmClearAll',
                      'Clear passed, seen, and read titles from all categories?'
                    )}
              </p>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => void change()}
              >
                {t(
                  'lumen.swipeHistory.confirmClearHistory',
                  'Confirm Clear History'
                )}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {t('lumen.swipeHistory.cancel', 'Cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              {t('lumen.swipeHistory.clearHistory', 'Clear History')}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
