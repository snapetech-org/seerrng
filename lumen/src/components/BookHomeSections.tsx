import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

type BookSection = { key: string; enabled: boolean };
const options = [
  ['popular:ebook', 'Popular Books'],
  ['new:ebook', 'New Books'],
  ['popular:audiobook', 'Popular Audiobooks'],
  ['new:audiobook', 'New Audiobooks'],
  ['subject:fantasy:ebook', 'Fantasy Books'],
  ['subject:mystery:ebook', 'Mystery Books'],
  ['subject:romance:ebook', 'Romance Books'],
  ['subject:science_fiction:ebook', 'Science Fiction Books'],
  ['subject:history:ebook', 'History Books'],
  ['subject:biography:ebook', 'Biography Books'],
  ['subject:fantasy:audiobook', 'Fantasy Audiobooks'],
  ['subject:mystery:audiobook', 'Mystery Audiobooks'],
  ['subject:romance:audiobook', 'Romance Audiobooks'],
  ['subject:science_fiction:audiobook', 'Science Fiction Audiobooks'],
  ['subject:history:audiobook', 'History Audiobooks'],
  ['subject:biography:audiobook', 'Biography Audiobooks'],
] as const;
const defaults: BookSection[] = [
  { key: 'popular:ebook', enabled: true },
  { key: 'popular:audiobook', enabled: true },
];

export function BookHomeSections({ userId }: { userId: number }) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState<BookSection[]>(defaults);
  const [draft, setDraft] = useState<BookSection[]>(defaults);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const path = `/user/${userId}/settings/discover-book-sections`;
  const load = useCallback(async () => {
    setLoading(true);
    setReady(false);
    setError('');
    try {
      const result = await api<{ sections: BookSection[] }>(path);
      if (!Array.isArray(result.sections))
        throw new Error(
          t(
            'lumen.account.bookSections.loadFailure',
            'Could not load book home sections.'
          )
        );
      setSaved(result.sections);
      setDraft(result.sections);
      setReady(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'lumen.account.bookSections.loadFailure',
              'Could not load book home sections.'
            )
      );
    } finally {
      setLoading(false);
    }
  }, [path, t]);
  useEffect(() => {
    void load();
  }, [load]);
  const changed = JSON.stringify(saved) !== JSON.stringify(draft);
  const add = () => {
    if (!selected || draft.some((item) => item.key === selected)) return;
    setDraft((current) => [...current, { key: selected, enabled: true }]);
    setSelected('');
  };
  const move = (index: number, delta: -1 | 1) =>
    setDraft((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const save = async () => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ sections: draft }),
      });
      const result = await api<{ sections: BookSection[] }>(path);
      if (!Array.isArray(result.sections))
        throw new Error(
          t(
            'lumen.account.bookSections.mismatch',
            'Saved sections did not match. Review the current values.'
          )
        );
      setSaved(result.sections);
      if (JSON.stringify(result.sections) === JSON.stringify(draft)) {
        setDraft(result.sections);
        setStatus(
          t('lumen.account.bookSections.saved', 'Book home sections saved.')
        );
      } else {
        setStatus('');
        setError(
          t(
            'lumen.account.bookSections.mismatch',
            'Saved sections did not match. Review the current values.'
          )
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'lumen.account.bookSections.saveFailure',
              'Could not save book home sections.'
            )
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title={t(
        'lumen.account.bookSections.title',
        'Book and Audiobook Home Sections'
      )}
    >
      <p className="note">
        {t(
          'lumen.account.bookSections.description',
          'Choose the book and audiobook rows on Discover, hide rows, and arrange their order.'
        )}
      </p>
      {loading ? (
        <p className="note" role="status">
          {t('lumen.account.loading', 'Loading…')}
        </p>
      ) : (
        <>
          <div className="cfg-row">
            <label htmlFor="book-home-section-add">
              {t('lumen.account.bookSections.add', 'Add Section')}
            </label>
            <select
              id="book-home-section-add"
              className="cfg-input"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={!ready || busy}
            >
              <option value="">
                {t('lumen.account.bookSections.choose', 'Choose a section')}
              </option>
              {options
                .filter(([key]) => !draft.some((item) => item.key === key))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {t(`lumen.account.bookSections.option.${key}`, label)}
                  </option>
                ))}
            </select>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={!selected || busy}
              onClick={add}
            >
              {t('lumen.account.bookSections.add', 'Add Section')}
            </button>
          </div>
          {draft.length === 0 && (
            <p className="note">
              {t(
                'lumen.account.bookSections.empty',
                'No sections are selected. Add one to show books on Discover.'
              )}
            </p>
          )}
          <div className="setlist">
            {draft.map((section, index) => {
              const option = options.find(([key]) => key === section.key);
              if (!option) return null;
              return (
                <div className="set" key={section.key}>
                  <strong>
                    {t(
                      `lumen.account.bookSections.option.${option[0]}`,
                      option[1]
                    )}
                  </strong>
                  <label className="cfg-on">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      disabled={busy || !ready}
                      onChange={(event) =>
                        setDraft((current) =>
                          current.map((item) =>
                            item.key === section.key
                              ? { ...item, enabled: event.target.checked }
                              : item
                          )
                        )
                      }
                    />
                    {t('lumen.account.bookSections.enabled', 'Show on Home')}
                  </label>
                  <div className="toolbar">
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      {t('lumen.account.bookSections.up', 'Move Up')}
                    </button>
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      disabled={busy || index === draft.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      {t('lumen.account.bookSections.down', 'Move Down')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {error && (
        <p className="note" role="alert">
          {error}{' '}
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={() => void load()}
          >
            {t('lumen.account.retry', 'Retry')}
          </button>
        </p>
      )}
      {status && (
        <p className="note" role="status">
          {status}
        </p>
      )}
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={busy || loading || !ready || !changed}
          onClick={() => void save()}
        >
          {busy
            ? t('lumen.account.saving', 'Saving…')
            : t('lumen.account.bookSections.save', 'Save Sections')}
        </button>
      </div>
    </Section>
  );
}
