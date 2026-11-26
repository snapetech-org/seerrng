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
              {addon.owned && (
                <Pill k="ok">{t('lumen.gameContent.inLibrary')}</Pill>
              )}
              <small>
                {addon.storyContent === true
                  ? t('lumen.gameContent.storyContent')
                  : addon.storyContent === false
                    ? t('lumen.gameContent.nonStoryContent')
                    : t('lumen.gameContent.contentTypeUnknown')}
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
              {edition.owned && (
                <Pill k="ok">{t('lumen.gameContent.inLibrary')}</Pill>
              )}
              {edition.contentKnown ? (
                <div>
                  <small>
                    {t('lumen.gameContent.itemsMissing', undefined, {
                      count: edition.includes.filter((item) => !item.owned)
                        .length,
                    })}
                  </small>
                  {edition.includes.map((item) => (
                    <small key={item.igdbId}>
                      {item.title}
                      {item.owned
                        ? ` · ${t('lumen.gameContent.inLibrary')}`
                        : ''}
                    </small>
                  ))}
                </div>
              ) : (
                <small>{t('lumen.gameContent.editionContentsUnknown')}</small>
              )}
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
