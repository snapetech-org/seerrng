import { useRef, useState } from 'react';
import { type CardTitleKind, type CardTitleMode } from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import { cardTitleModes, saveCardTitleModes } from '../cardTitleModes';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

export function CardTitleToggle({
  kinds,
  row = false,
}: {
  kinds: readonly CardTitleKind[];
  /** a settings switch row (Appearance) instead of a chip */
  row?: boolean;
}) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const modes = cardTitleModes(user?.settings);
  const always = kinds.every((kind) => modes[kind] === 'always');
  if (!user || !kinds.length) return null;
  const path = `/user/${user.id}/settings/card-text`;

  async function toggle() {
    if (pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    const mode: CardTitleMode = always ? 'hover' : 'always';
    const changed = kinds.filter((kind) => modes[kind] !== mode);
    try {
      const confirmed = await saveCardTitleModes(
        path,
        Object.fromEntries(changed.map((kind) => [kind, mode]))
      );
      if (generation !== sessionGeneration()) return;
      forget(path);
      await refresh();
      if (
        generation === sessionGeneration() &&
        changed.some((kind) => confirmed[kind] !== mode)
      )
        toast('Could not confirm the saved card title settings.');
    } catch {
      if (generation === sessionGeneration())
        toast('Could not save card title settings. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (row)
    return (
      <div
        className={`set toggle-row ${busy ? 'locked' : ''}`}
        role="switch"
        aria-checked={always}
        aria-disabled={busy}
        tabIndex={busy ? -1 : 0}
        onClick={() => void toggle()}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            void toggle();
          }
        }}
      >
        <span>
          <b>Title View</b>
          <small>
            Show titles under posters for movies, series, music and books.
            Account Settings has a choice per type.
          </small>
        </span>
        <span className="sw" />
      </div>
    );

  return (
    <button
      type="button"
      className="chip"
      aria-label="Title View: Always show poster titles"
      aria-pressed={always}
      disabled={busy}
      onClick={() => void toggle()}
    >
      Title View
    </button>
  );
}
