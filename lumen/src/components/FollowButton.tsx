import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { useToast } from './toast';

interface FollowIdentity {
  kind: string;
  subjectKey: string;
  subjectLabel: string;
  conditions?: {
    language?: string;
    ref: Record<string, string | number | boolean>;
  };
}

interface FollowRecord {
  id: number;
  kind: string;
  subjectKey: string;
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
    try {
      if (match) {
        await api('/follow/' + match.id, { method: 'DELETE' });
        setConfirmed(null);
      } else {
        const created = await api<FollowRecord>('/follow', {
          method: 'POST',
          body: JSON.stringify(subject),
        });
        setConfirmed(created);
      }
    } catch (error) {
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
