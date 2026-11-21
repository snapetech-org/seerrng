import { useRef, useState } from 'react';
import { api, type Paged, type TitleResult } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';
import { useToast } from './toast';

export type MappingCandidate = {
  id: string;
  title: string;
  year?: number;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  mappingAvailable?: boolean;
  identityMapped?: boolean;
  identityResolution?: 'personal' | 'curated' | 'external-id';
};

export function videoHref(item: MappingCandidate) {
  if (
    (item.mediaType === 'movie' || item.mediaType === 'tv') &&
    typeof item.tmdbId === 'number' &&
    Number.isSafeInteger(item.tmdbId) &&
    item.tmdbId > 0 &&
    item.tmdbId <= 1_000_000_000
  )
    return `/${item.mediaType}/${item.tmdbId}`;
}

export default function IdentityMapping({
  item,
  updated,
}: {
  item: MappingCandidate;
  updated: () => void;
}) {
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<{ term: string; type: string }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const toast = useToast();
  const search = useApi<Paged<TitleResult>>(
    open && matches
      ? `/search?${new URLSearchParams({ query: matches.term, type: matches.type, page: '1' })}`
      : null,
    { currentPathOnly: true }
  );
  const results = (
    Array.isArray(search.data?.results) ? search.data.results : []
  ).filter(
    (result) =>
      result?.mediaType === matches?.type &&
      Number.isSafeInteger(result.id) &&
      result.id > 0 &&
      result.id <= 1_000_000_000
  );

  async function change(id?: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const path = '/integrations/discovery/mappings';
      if (id === undefined) {
        await api(
          `${path}/${encodeURIComponent(item.id)}`,
          { method: 'DELETE' },
          'empty'
        );
      } else {
        await api(path, {
          method: 'PUT',
          body: JSON.stringify({
            identity: item.id,
            tmdbId: id,
            mediaType: matches?.type,
          }),
        });
      }
      setOpen(false);
      setMatches(undefined);
      updated();
    } catch (cause) {
      toast(
        friendlyError(
          cause,
          t(
            'components.IdentityMappingControls.saveFailed',
            'The match could not be saved. Try again.'
          )
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setMatches(undefined);
          }}
        >
          {videoHref(item)
            ? t(
                'components.IdentityMappingControls.change',
                'Change title match'
              )
            : t(
                'components.IdentityMappingControls.match',
                'Match catalog title'
              )}
        </button>
        {item.identityMapped && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy}
            onClick={() => void change()}
          >
            {t('components.IdentityMappingControls.reset', 'Reset title match')}
          </button>
        )}
      </div>
      {open && (
        <>
          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const term = String(form.get('query') ?? '').trim();
              const type = form.get('type') === 'tv' ? 'tv' : 'movie';
              if (term.length < 2 || term.length > 256) return;
              if (matches?.term === term && matches.type === type)
                search.reload();
              else setMatches({ term, type });
            }}
          >
            <label className="search">
              <input
                name="query"
                type="search"
                aria-label={t(
                  'components.IdentityMappingControls.searchLabel',
                  'Search SeerrNG catalog'
                )}
                placeholder={t(
                  'components.IdentityMappingControls.searchHint',
                  'Enter at least two characters.'
                )}
                defaultValue={item.title}
                required
                minLength={2}
                maxLength={256}
                disabled={busy}
              />
            </label>
            <label className="sel">
              <span className="lbl">
                {t(
                  'components.IdentityMappingControls.mediaTypeLabel',
                  'Catalog media type'
                )}
              </span>
              <select
                name="type"
                aria-label={t(
                  'components.IdentityMappingControls.mediaTypeLabel',
                  'Catalog media type'
                )}
                defaultValue={item.mediaType ?? 'movie'}
                disabled={busy}
              >
                <option value="movie">
                  {t('components.IdentityMappingControls.movie', 'Movie')}
                </option>
                <option value="tv">
                  {t('components.IdentityMappingControls.series', 'Series')}
                </option>
              </select>
            </label>
            <button
              className="btn btn-tonal btn-sm"
              type="submit"
              disabled={busy}
            >
              {t('i18n.searchLabel', 'Search')}
            </button>
          </form>
          {matches && (
            <ServiceNote
              error={search.error}
              what={t('lumen.myMedia.catalogMatches', 'catalogue matches')}
              title={t('lumen.myMedia.couldNotLoad', 'Could not load {what}', {
                what: t('lumen.myMedia.catalogMatches', 'catalogue matches'),
              })}
              retry={search.reload}
            />
          )}
          {matches && !search.data && !search.error && (
            <p className="note" role="status">
              {t('components.IdentityMappingControls.searching', 'Searching…')}
            </p>
          )}
          {matches &&
            search.data &&
            (results.length ? (
              <ul className="setlist">
                {results.map((result) => {
                  const title =
                    result.title ?? result.name ?? String(result.id);
                  return (
                    <li className="set" key={result.id}>
                      <div>
                        <b>{title}</b>
                        <small>
                          {(result.releaseDate ?? result.firstAirDate)?.slice(
                            0,
                            4
                          )}{' '}
                          · TMDB {result.id}
                        </small>
                      </div>
                      <button
                        className="btn btn-tonal btn-sm"
                        type="button"
                        disabled={busy}
                        aria-label={`${t('components.IdentityMappingControls.useMatch', 'Use this match')}: ${title}`}
                        onClick={() => void change(result.id)}
                      >
                        {t(
                          'components.IdentityMappingControls.useMatch',
                          'Use this match'
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="note">
                {t(
                  'components.IdentityMappingControls.noResults',
                  'No matching titles were found.'
                )}
              </p>
            ))}
        </>
      )}
    </div>
  );
}
