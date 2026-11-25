import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { canManageRequests } from './detail';
import { useToast } from './toast';

type Issue = {
  issueId: string;
  type: string;
  severity: string;
  status: string;
  title?: string;
  reason?: string;
  canAutoFix: boolean;
  remediationJobId?: string;
};
const ISSUE_TYPES = [
  'SuspectedTranscode',
  'NonCanonicalVariant',
  'TrackNotInTaggedRelease',
  'MissingTrackInRelease',
  'CorruptedFile',
  'MissingMetadata',
  'MultipleVariants',
  'WrongDuration',
] as const;

export default function AlbumLibraryHealth({
  releaseGroupId,
}: {
  releaseGroupId: string;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const manage = canManageRequests(user?.permissions);
  const service = useApi<{ configured: boolean }>(
    manage ? '/soulseek/status' : null
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = `/soulseek/albums/${encodeURIComponent(releaseGroupId)}/issues`;
  const result = useApi<{ issues: Issue[]; configured?: boolean }>(
    open ? endpoint : null
  );
  if (!manage || !service.data?.configured) return null;
  const issues = result.data?.issues ?? [];
  const fixable = issues.filter(
    (issue) => issue.canAutoFix && !issue.remediationJobId
  );
  const issueName = (type: string) => {
    const key = ISSUE_TYPES.includes(type as (typeof ISSUE_TYPES)[number])
      ? `lumen.music.health.${type}`
      : '';
    return key ? t(key, type) : type;
  };
  const fix = async () => {
    setBusy(true);
    try {
      const response = await api<{ issueCount: number }>(
        `/soulseek/albums/${encodeURIComponent(releaseGroupId)}/remediate`,
        {
          method: 'POST',
          body: JSON.stringify({
            issueIds: fixable.map(({ issueId }) => issueId),
          }),
        }
      );
      toast(
        t('lumen.music.health.started', 'Started fixing {count} issues.', {
          count: response.issueCount,
        })
      );
      result.revalidate();
    } catch {
      toast(
        t('lumen.music.health.failed', 'Could not start the library repair.')
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="music-library-health">
      <button
        className="btn btn-quiet btn-sm"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {t('lumen.music.health.button', 'Library Health')}
      </button>
      {open && (
        <Section title={t('lumen.music.health.title', 'Library Health')}>
          {result.error && (
            <>
              <p className="note" role="alert">
                {t(
                  'lumen.music.health.loadFailed',
                  'Album library health could not be loaded.'
                )}
              </p>
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                onClick={result.revalidate}
              >
                {t('lumen.music.health.retry', 'Retry')}
              </button>
            </>
          )}
          {!result.data && !result.error && (
            <p className="note" role="status">
              {t('lumen.music.health.loading', 'Checking the music library…')}
            </p>
          )}
          {result.data && issues.length === 0 && (
            <p className="note">
              {t(
                'lumen.music.health.none',
                'No open issues were found for this album.'
              )}
            </p>
          )}
          {!!issues.length && (
            <ul className="slist">
              {issues.map((issue) => (
                <li className="set" key={issue.issueId}>
                  <b>{issueName(issue.type)}</b>
                  {issue.title && <span>{issue.title}</span>}
                  <small>
                    {t('lumen.music.health.severity', 'Severity')}:{' '}
                    {issue.severity} ·{' '}
                    {t('lumen.music.health.status', 'Status')}: {issue.status}
                  </small>
                  {issue.canAutoFix && (
                    <small>
                      {t(
                        'lumen.music.health.fixable',
                        'Can be fixed automatically'
                      )}
                    </small>
                  )}
                  {issue.reason && <p className="note">{issue.reason}</p>}
                </li>
              ))}
            </ul>
          )}
          {!!fixable.length && (
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              disabled={busy}
              onClick={() => void fix()}
            >
              {busy
                ? t('lumen.music.health.starting', 'Starting…')
                : fixable.length === 1
                  ? t('lumen.music.health.fixOne', 'Fix 1 issue with Soulseek')
                  : t(
                      'lumen.music.health.fixAll',
                      'Fix {count} issues with Soulseek',
                      { count: fixable.length }
                    )}
            </button>
          )}
        </Section>
      )}
    </div>
  );
}
