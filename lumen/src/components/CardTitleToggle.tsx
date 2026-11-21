import { useRef, useState } from 'react';
import { type CardTitleKind, type CardTitleMode } from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import { cardTitleModes, saveCardTitleModes } from '../cardTitleModes';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

export function CardTitleToggle({
  kinds,
}: {
  kinds: readonly CardTitleKind[];
}) {
  const { user, refresh } = useAuth();
  const { t } = useLumenLocale();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const modes = cardTitleModes(user?.settings);
  const always = kinds.every((kind) => modes[kind] === 'always');
  const titleView = t('lumen.cards.titleView');
  const titleAction = t(
    always ? 'lumen.cards.titleViewOnHover' : 'lumen.cards.titleViewAlways'
  );
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

  return (
    <button
      type="button"
      className="chip"
      aria-label={t('lumen.cards.titleViewAction', undefined, {
        view: titleView,
        action: titleAction,
      })}
      aria-pressed={always}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {titleView}
    </button>
  );
}
