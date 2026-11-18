import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useToast } from './toast';

interface FollowIdentity {
  kind: string;
  subjectKey: string;
  subjectLabel: string;
  conditions?: { ref: Record<string, string | number> };
}

interface FollowRecord {
  id: number;
  kind: string;
  subjectKey: string;
}

export default function FollowButton({ subject }: { subject: FollowIdentity }) {
  const follows = useApi<{ results: FollowRecord[] }>('/follow');
  const toast = useToast();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<FollowRecord | null>();
  const match =
    confirmed === undefined
      ? follows.data?.results.find(
          ({ kind, subjectKey }) =>
            kind === subject.kind && subjectKey === subject.subjectKey
        )
      : confirmed;

  async function toggle() {
    if (pending.current || !follows.data) return;
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
      toast(friendlyError(error, 'Couldn’t update Following'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-tonal btn-sm"
      disabled={saving || (!follows.data && !follows.error)}
      aria-pressed={!follows.error ? Boolean(match) : undefined}
      onClick={() => (follows.error ? follows.reload() : void toggle())}
    >
      {follows.error ? 'Retry Follow Status' : match ? 'Following' : 'Follow'}
    </button>
  );
}
