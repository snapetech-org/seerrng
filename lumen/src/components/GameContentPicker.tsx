import { useState } from 'react';
import type { GameContentSelection } from '../extras';
import { useApi } from '../hooks';
import { Section } from './cards';
import { Pill } from './detail';
import { ServiceNote } from './extra';

type Content = {
  igdbId: number;
  title: string;
  owned: boolean;
  storyContent: boolean | null;
};
type Edition = {
  igdbId: number;
  title: string;
  owned: boolean;
  contentKnown: boolean;
  includes: Content[];
};
type Catalog = { available: boolean; editions?: Edition[]; addons?: Content[] };
type Mode = 'base' | 'missing-selected' | 'edition';

export default function GameContentPicker({
  id,
  disabled,
  onChange,
}: {
  id: number;
  disabled: boolean;
  onChange: (value: GameContentSelection | null | undefined) => void;
}) {
  const catalog = useApi<Catalog>(`/game-content/${id}/editions`);
  const [mode, setMode] = useState<Mode>('base');
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [editionId, setEditionId] = useState<number>();
  if (catalog.error)
    return (
      <ServiceNote
        error={catalog.error}
        what="game editions and add-ons"
        retry={catalog.reload}
      />
    );
  if (catalog.data?.available !== true) return null;
  const editions = Array.isArray(catalog.data.editions)
    ? catalog.data.editions
    : [];
  const addons = Array.isArray(catalog.data.addons) ? catalog.data.addons : [];
  if (!editions.length && !addons.length) return null;
  function changeMode(next: Mode) {
    setMode(next);
    setAddonIds([]);
    setEditionId(undefined);
    onChange(next === 'base' ? null : undefined);
  }
  return (
    <Section title="Game Content">
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Content to Request</span>
          <select
            value={mode}
            disabled={disabled}
            onChange={(event) => changeMode(event.target.value as Mode)}
          >
            <option value="base">Base Game</option>
            {!!addons.length && (
              <option value="missing-selected">Selected Add-ons</option>
            )}
            {!!editions.length && (
              <option value="edition">Complete Edition</option>
            )}
          </select>
        </label>
      </div>
      {mode === 'missing-selected' && (
        <ul className="setlist">
          {addons.map((addon) => (
            <li className="set" key={addon.igdbId}>
              <label className="sel">
                <input
                  type="checkbox"
                  checked={addonIds.includes(addon.igdbId)}
                  disabled={
                    disabled ||
                    addon.owned ||
                    (addonIds.length >= 30 && !addonIds.includes(addon.igdbId))
                  }
                  onChange={(event) => {
                    const ids = event.target.checked
                      ? [...addonIds, addon.igdbId]
                      : addonIds.filter((id) => id !== addon.igdbId);
                    setAddonIds(ids);
                    onChange(
                      ids.length
                        ? {
                            kind: 'game-content',
                            mode: 'missing-selected',
                            addonIds: ids,
                          }
                        : undefined
                    );
                  }}
                />
                {addon.title}
              </label>
              {addon.owned && <Pill k="ok">In Library</Pill>}
              <small>
                {addon.storyContent === true
                  ? 'Story content'
                  : addon.storyContent === false
                    ? 'Non-story content'
                    : 'Content type unknown'}
              </small>
            </li>
          ))}
        </ul>
      )}
      {mode === 'edition' && (
        <ul className="setlist">
          {editions.map((edition) => (
            <li className="set" key={edition.igdbId}>
              <label className="sel">
                <input
                  type="radio"
                  name="pc-game-edition"
                  checked={editionId === edition.igdbId}
                  disabled={disabled || edition.owned}
                  onChange={() => {
                    setEditionId(edition.igdbId);
                    onChange({
                      kind: 'game-content',
                      mode: 'edition',
                      editionId: edition.igdbId,
                      addonIds: [],
                    });
                  }}
                />
                {edition.title}
              </label>
              {edition.owned && <Pill k="ok">In Library</Pill>}
              {edition.contentKnown ? (
                <div>
                  <small>
                    {edition.includes.filter((item) => !item.owned).length}{' '}
                    items missing from your library
                  </small>
                  {edition.includes.map((item) => (
                    <small key={item.igdbId}>
                      {item.title}
                      {item.owned ? ' · In Library' : ''}
                    </small>
                  ))}
                </div>
              ) : (
                <small>Edition contents are unknown.</small>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
