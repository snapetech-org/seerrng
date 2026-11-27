import { useState } from 'react';
import { type GameContentSelection, useGameContentCatalog } from '../extras';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { Pill } from './detail';
import { ServiceNote } from './extra';

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
  const { t } = useLumenLocale();
  const catalog = useGameContentCatalog(id);
  const [mode, setMode] = useState<Mode>('base');
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [editionId, setEditionId] = useState<number>();
  if (catalog.error)
    return (
      <ServiceNote
        error={catalog.error}
        what={t('lumen.error.what.gameContent', 'game editions and add-ons')}
        retry={catalog.reload}
      />
    );
  if (catalog.data === null)
    return (
      <p className="note" role="status">
        {t('lumen.gameContent.loading', 'Checking editions…')}
      </p>
    );
  if (catalog.data?.available !== true) return null;
  const editions = Array.isArray(catalog.data.editions)
    ? catalog.data.editions
    : [];
  const addons = Array.isArray(catalog.data.addons) ? catalog.data.addons : [];
  const selectedEdition = editions.find(
    (edition) => edition.igdbId === editionId
  );
  const selectedAddons = addons.filter((addon) =>
    addonIds.includes(addon.igdbId)
  );
  const typeMessages: Record<string, [string, string]> = {
    expansion: ['components.GameContent.typeExpansion', 'Expansion'],
    dlc: ['components.GameContent.typeDlc', 'Add-on'],
    cosmetic: ['components.GameContent.typeCosmetic', 'Cosmetic'],
    'season-pass': ['components.GameContent.typeSeasonPass', 'Season Pass'],
    bonus: ['components.GameContent.typeBonus', 'Bonus'],
    soundtrack: ['components.GameContent.typeSoundtrack', 'Soundtrack'],
    unknown: ['components.GameContent.typeUnknown', 'Other'],
  };
  const typeLabel = (type?: string) => {
    const [key, fallback] =
      typeMessages[type ?? 'unknown'] ?? typeMessages.unknown!;
    return t(key, fallback);
  };
  const contentFacts = (item: (typeof addons)[number]) => (
    <>
      <div className="row">
        <Pill k="neutral">{typeLabel(item.type)}</Pill>
        <Pill k={item.storyContent === true ? 'ok' : 'neutral'}>
          {item.storyContent === true
            ? t('components.GameContent.story', 'Story')
            : item.storyContent === false
              ? t('components.GameContent.cosmetic', 'Cosmetic')
              : t(
                  'components.GameContent.contentNotListed',
                  'Content not listed'
                )}
        </Pill>
        {item.owned && (
          <Pill k="ok">
            {t('components.GameContent.owned', 'In Your Library')}
          </Pill>
        )}
      </div>
      {item.releaseDate && <small>{item.releaseDate}</small>}
    </>
  );
  const requestSummary =
    mode === 'edition' && selectedEdition
      ? t(
          'lumen.gameContent.summaryEdition',
          'Request {title} and its missing content.',
          { title: selectedEdition.title }
        )
      : mode === 'missing-selected' && selectedAddons.length
        ? t(
            'lumen.gameContent.summaryAddons',
            'Request the base game if needed, plus: {titles}.',
            { titles: selectedAddons.map((addon) => addon.title).join(', ') }
          )
        : mode === 'missing-selected'
          ? t(
              'lumen.gameContent.summaryChooseAddons',
              'Choose at least one add-on, or switch to the base game.'
            )
          : t('lumen.gameContent.summaryBase', 'Request the base game.');
  if (!editions.length && !addons.length) return null;
  function changeMode(next: Mode) {
    setMode(next);
    setAddonIds([]);
    setEditionId(undefined);
    onChange(next === 'base' ? null : undefined);
  }
  return (
    <Section title={t('lumen.gameContent.title')}>
      {catalog.data.base && (
        <p className="note" role="status">
          {catalog.data.base.owned
            ? t(
                'lumen.gameContent.baseOwned',
                'You already have the base game.'
              )
            : t(
                'lumen.gameContent.baseNotOwned',
                'The base game is not in your library yet.'
              )}
        </p>
      )}
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">{t('lumen.gameContent.contentToRequest')}</span>
          <select
            value={mode}
            disabled={disabled}
            onChange={(event) => changeMode(event.target.value as Mode)}
          >
            <option value="base">{t('lumen.gameContent.baseGame')}</option>
            {!!addons.length && (
              <option value="missing-selected">
                {t('lumen.gameContent.selectedAddons')}
              </option>
            )}
            {!!editions.length && (
              <option value="edition">
                {t('lumen.gameContent.completeEdition')}
              </option>
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
              {contentFacts(addon)}
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
                  disabled={disabled}
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
              {edition.owned && (
                <Pill k="ok">{t('lumen.gameContent.inLibrary')}</Pill>
              )}
              <div className="set-body">
                {edition.summary && <small>{edition.summary}</small>}
                {edition.releaseDate && <small>{edition.releaseDate}</small>}
                {edition.contentKnown ? (
                  <div>
                    <small>
                      {t('components.GameContent.includes', 'Includes')}
                    </small>
                    {edition.includes.map((item) => (
                      <div key={item.igdbId}>
                        <strong>{item.title}</strong>
                        {contentFacts(item)}
                      </div>
                    ))}
                    {(() => {
                      const missing = edition.includes.filter(
                        (item) => !item.owned
                      ).length;
                      return (
                        <small>
                          {missing === 0
                            ? t(
                                'components.GameContent.addsNothing',
                                'This edition adds nothing you do not already have.'
                              )
                            : missing === 1
                              ? t(
                                  'lumen.gameContent.itemMissing',
                                  '1 item is missing from your library.'
                                )
                              : t('lumen.gameContent.itemsMissing', undefined, {
                                  count: missing,
                                })}
                        </small>
                      );
                    })()}
                  </div>
                ) : (
                  <small>{t('lumen.gameContent.editionContentsUnknown')}</small>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="note" role="status">
        <strong>
          {t('lumen.gameContent.requestSummary', 'What this request gets')}:
        </strong>{' '}
        {requestSummary}
      </p>
    </Section>
  );
}
