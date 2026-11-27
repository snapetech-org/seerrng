import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

interface FollowIdentity {
  kind: string;
  subjectKey: string;
  subjectLabel: string;
  conditions?: {
    language?: string;
    includeTypes?: string[];
    excludeTypes?: string[];
    ref: Record<string, string | number | boolean>;
  };
}

interface FollowRecord {
  id: number;
  kind: string;
  subjectKey: string;
}

async function readFollows(): Promise<FollowRecord[]> {
  const response = await api<{ results?: unknown }>('/follow', {
    cache: 'no-store',
  });
  if (
    !Array.isArray(response.results) ||
    response.results.some(
      (record) =>
        !record ||
        typeof record !== 'object' ||
        !Number.isSafeInteger((record as FollowRecord).id) ||
        (record as FollowRecord).id <= 0 ||
        typeof (record as FollowRecord).kind !== 'string' ||
        typeof (record as FollowRecord).subjectKey !== 'string'
    )
  )
    throw new Error('Following status could not be verified.');
  return response.results as FollowRecord[];
}

export default function FollowButton({
  subject,
  label,
}: {
  subject: FollowIdentity;
  label?: string;
}) {
  const { t } = useLumenLocale();
  const follows = useApi<{ results: FollowRecord[] }>('/follow');
  const toast = useToast();
  const pending = useRef(false);
  const verifyBeforeToggle = useRef(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<FollowRecord | null>();
  const rows = Array.isArray(follows.data?.results)
    ? follows.data.results
    : undefined;
  const loadError = follows.error || (follows.data && !rows);
  const match =
    confirmed === undefined
      ? rows?.find(
          ({ kind, subjectKey }) =>
            kind === subject.kind && subjectKey === subject.subjectKey
        )
      : confirmed;

  async function toggle() {
    if (pending.current || !rows) return;
    pending.current = true;
    setSaving(true);
    const session = sessionGeneration();
    if (verifyBeforeToggle.current) {
      try {
        const latest = await readFollows();
        if (sessionGeneration() !== session) return;
        const current =
          latest.find(
            ({ kind, subjectKey }) =>
              kind === subject.kind && subjectKey === subject.subjectKey
          ) ?? null;
        setConfirmed(current);
        verifyBeforeToggle.current = false;
        toast(
          t(
            'lumen.followButton.statusRefreshed',
            'Following status refreshed. Review the current action.'
          )
        );
      } catch {
        if (sessionGeneration() === session)
          toast(
            t(
              'lumen.followButton.confirmFailure',
              'Could not confirm the Following change. Reload and retry.'
            )
          );
      } finally {
        pending.current = false;
        setSaving(false);
      }
      return;
    }
    const desired = !match;
    try {
      let writeError: unknown;
      try {
        if (desired) {
          await api<FollowRecord>('/follow', {
            method: 'POST',
            body: JSON.stringify(subject),
          });
        } else if (match) {
          await api('/follow/' + match.id, { method: 'DELETE' });
        }
      } catch (error) {
        writeError = error;
      }
      // A lost response does not prove that the membership write failed.
      let afterWrite: FollowRecord[];
      try {
        afterWrite = await readFollows();
      } catch {
        verifyBeforeToggle.current = true;
        if (sessionGeneration() === session)
          toast(
            t(
              'lumen.followButton.confirmFailure',
              'Could not confirm the Following change. Reload and retry.'
            )
          );
        return;
      }
      if (sessionGeneration() !== session) return;
      const confirmedRecord =
        afterWrite.find(
          ({ kind, subjectKey }) =>
            kind === subject.kind && subjectKey === subject.subjectKey
        ) ?? null;
      if (Boolean(confirmedRecord) !== desired) {
        if (writeError) throw writeError;
        throw new Error(
          t(
            'lumen.followButton.confirmFailure',
            'Could not confirm the Following change. Reload and retry.'
          )
        );
      }
      if (sessionGeneration() !== session) return;
      setConfirmed(confirmedRecord);
    } catch (error) {
      if (sessionGeneration() === session)
        toast(
          friendlyError(
            error,
            t('lumen.followButton.updateFailed', 'Couldn’t update Following'),
            t
          )
        );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-tonal btn-sm"
      disabled={saving || (!rows && !loadError)}
      aria-pressed={!loadError ? Boolean(match) : undefined}
      onClick={() => (loadError ? follows.reload() : void toggle())}
    >
      {loadError
        ? t('lumen.followButton.retryStatus', 'Retry Follow Status')
        : match
          ? t('lumen.followButton.following', 'Following')
          : (label ?? t('lumen.followButton.follow', 'Follow'))}
    </button>
  );
}
