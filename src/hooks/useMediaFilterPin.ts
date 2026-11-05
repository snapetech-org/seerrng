import { useUser } from '@app/hooks/useUser';
import type {
  MediaFilterScope,
  MediaFilterValue,
} from '@server/interfaces/api/userSettingsInterfaces';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

/** Pins are account settings; explicit navigation always wins over restoration. */
export default function useMediaFilterPin<T extends MediaFilterValue>({
  scope,
  selected,
  values,
  restore,
  ready = true,
  explicit = false,
}: {
  scope: MediaFilterScope;
  selected: T;
  values: readonly T[];
  restore: (value: T) => void;
  ready?: boolean;
  explicit?: boolean;
}) {
  const { user, revalidate } = useUser();
  const saved = user?.settings?.mediaFilterPins?.[scope];
  const initialized = useRef<string | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ready || !user) return;
    const key = `${user.id}:${scope}`;
    if (initialized.current === key) return;
    initialized.current = key;
    if (
      !explicit &&
      saved !== undefined &&
      values.includes(saved as T) &&
      saved !== selected
    )
      restore(saved as T);
  }, [explicit, ready, restore, saved, scope, selected, user, values]);

  const save = (value: T | null) => {
    if (!user) return;
    setBusy(true);
    setError(false);
    queue.current = queue.current
      .then(async () => {
        try {
          await axios.post(
            `/api/v1/user/${user.id}/settings/media-filter-pins/${scope}`,
            { value }
          );
          await revalidate();
        } catch {
          setError(true);
        }
      })
      .finally(() => setBusy(false));
    return queue.current;
  };
  return {
    pinnedValue: saved,
    busy,
    error,
    available: Boolean(user),
    select: (value: T) => {
      if (saved !== undefined && saved !== value) return save(value);
    },
    toggle: (value: T) => save(saved === value ? null : value),
  };
}
