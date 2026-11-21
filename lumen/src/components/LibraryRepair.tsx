import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';

type Batch = {
  nextPage: number;
  scanned: number;
  matched: number;
  saved: number;
  hasMore: boolean;
  truncated: boolean;
  limitReached: boolean;
};

export default function LibraryRepair({
  path,
  shelf,
  mediaType,
  reload,
}: {
  path: string;
  shelf: string;
  mediaType?: string;
  reload: () => void;
}) {
  const { t } = useLumenLocale();
  const [nextPage, setNextPage] = useState(1);
  const [totals, setTotals] = useState({ scanned: 0, matched: 0, saved: 0 });
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const run = useRef<AbortController | null>(null);
  const stop = useRef(false);
  useEffect(() => () => run.current?.abort(), []);

  async function scan() {
    if (run.current) return;
    const controller = new AbortController();
    const generation = sessionGeneration();
    const active = () =>
      !controller.signal.aborted && generation === sessionGeneration();
    run.current = controller;
    stop.current = false;
    setRunning(true);
    setError('');
    if (nextPage === 1) setTotals({ scanned: 0, matched: 0, saved: 0 });
    let page = nextPage;
    try {
      while (active() && !stop.current) {
        setStatus(
          t('library.repairRunning', 'Scanning page {page}…', { page })
        );
        const batch = await api<Batch>(path, {
          method: 'POST',
          body: JSON.stringify({
            shelf,
            startPage: page,
            pageCount: 5,
            mediaType,
          }),
          signal: controller.signal,
        });
        if (!active()) return;
        if (
          batch.hasMore &&
          !batch.truncated &&
          !batch.limitReached &&
          (!Number.isSafeInteger(batch.nextPage) ||
            batch.nextPage <= page ||
            batch.nextPage > 500)
        )
          throw new Error(
            t(
              'lumen.myMedia.scanInvalidNext',
              'The library scan returned an invalid next page.'
            )
          );
        setTotals((previous) => ({
          scanned: previous.scanned + batch.scanned,
          matched: previous.matched + batch.matched,
          saved: previous.saved + batch.saved,
        }));
        if (batch.saved > 0) reload();
        if (!batch.hasMore || batch.truncated || batch.limitReached) {
          setNextPage(1);
          setStatus(
            batch.limitReached
              ? t(
                  'library.repairLimit',
                  'Your private title-match limit was reached. Later exact matches were not saved.'
                )
              : batch.truncated
                ? t(
                    'library.repairTruncated',
                    'The provider library reached SeerrNG’s 500-page scan limit. Continue browsing in the provider app.'
                  )
                : t('library.repairComplete', 'Library scan complete.')
          );
          return;
        }
        page = batch.nextPage;
        setNextPage(page);
        if (!stop.current)
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener('abort', finish);
              resolve();
            };
            const timer = setTimeout(finish, 3100);
            controller.signal.addEventListener('abort', finish, { once: true });
          });
      }
      if (active())
        setStatus(
          t('library.repairPaused', 'Scan paused at page {page}.', { page })
        );
    } catch (reason) {
      if (active()) {
        setStatus('');
        setError(
          friendlyError(
            reason,
            t(
              'lumen.myMedia.scanFailed',
              'Could not scan the library. Try again.'
            )
          )
        );
      }
    } finally {
      run.current = null;
      if (active()) {
        setRunning(false);
        setStopping(false);
      }
    }
  }

  return (
    <Section
      title={t('library.repair', 'Find exact ID matches across this library')}
    >
      <p className="note">
        {t(
          'library.repairDescription',
          'Scan every page for unique IMDb or TVDB matches. Confirmed matches are saved to your private title matches; titles without a clear exact match remain available for manual matching.'
        )}
      </p>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={running}
          onClick={() => void scan()}
        >
          {nextPage === 1
            ? t('lumen.myMedia.scan', 'Scan Library')
            : t('library.repairContinue', 'Continue scan')}
        </button>
        {running && (
          <button
            className="btn btn-quiet btn-sm"
            disabled={stopping}
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
          >
            {stopping
              ? t('library.repairStopping', 'Stopping after this batch…')
              : t('library.repairStop', 'Stop after this batch')}
          </button>
        )}
      </div>
      {status && (
        <p className="note" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {(totals.scanned > 0 || totals.saved > 0) && (
        <p className="note">
          {t(
            'library.repairSummary',
            'Scanned {scanned} titles, found {matched} exact matches, and saved {saved} private title matches.',
            totals
          )}
        </p>
      )}
    </Section>
  );
}
