import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';

const path = '/integrations/discovery/mappings/pack';
type Draft = { name: string; contents: string; count: number };

export default function PersonalIdentityPacks({
  onImported,
}: {
  onImported: () => void;
}) {
  const { t } = useLumenLocale();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');

  function clear() {
    setDraft(undefined);
    if (input.current) input.current.value = '';
  }

  async function run<T>(
    work: () => Promise<T>,
    done: (result: T) => void,
    fallback: string
  ) {
    if (pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const result = await work();
      if (generation === sessionGeneration()) done(result);
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(friendlyError(error, fallback));
    } finally {
      pending.current = false;
      if (generation === sessionGeneration()) setBusy(false);
    }
  }

  function choose(file?: File) {
    if (!file) return;
    setDraft(undefined);
    void run(
      async () => {
        try {
          if (file.size > 5 * 1024 * 1024)
            throw new Error(
              t(
                'components.IdentityMappingPackControls.fileTooLarge',
                'The title-match file must be 5 MiB or smaller.'
              )
            );
          const contents = await file.text();
          const pack = JSON.parse(contents);
          if (
            pack?.format !== 'seerrng.personal-title-matches' ||
            pack.version !== 1 ||
            typeof pack.exportedAt !== 'string' ||
            !Number.isFinite(Date.parse(pack.exportedAt)) ||
            !Array.isArray(pack.entries) ||
            pack.entries.length > 10_000
          )
            throw new Error(
              t(
                'components.IdentityMappingPackControls.invalidFile',
                'Choose a supported SeerrNG title-match JSON file.'
              )
            );
          return { name: file.name, contents, count: pack.entries.length };
        } catch (error) {
          clear();
          if (error instanceof SyntaxError)
            throw new Error(
              t(
                'components.IdentityMappingPackControls.invalidFile',
                'Choose a supported SeerrNG title-match JSON file.'
              ),
              { cause: error }
            );
          throw error;
        }
      },
      setDraft,
      t(
        'components.IdentityMappingPackControls.importFailed',
        'The title-match pack could not be imported. Check the file and try again.'
      )
    );
  }

  function importPack() {
    if (!draft) return;
    return run(
      () =>
        api<{ imported: number; updated: number; unchanged: number }>(path, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: draft.contents,
        }),
      ({ imported, updated, unchanged }) => {
        clear();
        setNotice(
          t(
            'components.IdentityMappingPackControls.imported',
            'Imported {imported}, updated {updated}, and left {unchanged} unchanged.',
            { imported, updated, unchanged }
          )
        );
        onImported();
      },
      t(
        'components.IdentityMappingPackControls.importFailed',
        'The title-match pack could not be imported. Check the file and try again.'
      )
    );
  }

  function exportPack() {
    return run(
      () => api<unknown>(path),
      (pack) => {
        const href = URL.createObjectURL(
          new Blob([JSON.stringify(pack, null, 2)], {
            type: 'application/json',
          })
        );
        const link = document.createElement('a');
        link.href = href;
        link.download = `seerrng-title-matches-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      },
      t(
        'components.IdentityMappingPackControls.exportFailed',
        'Your title matches could not be exported. Try again.'
      )
    );
  }

  return (
    <Section
      title={t(
        'components.IdentityMappingPackControls.title',
        'Personal title matches'
      )}
    >
      <p className="note">
        {t(
          'components.IdentityMappingPackControls.description',
          'Export or restore your private matches for provider titles.'
        )}
      </p>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => void exportPack()}
        >
          {t(
            'components.IdentityMappingPackControls.export',
            'Export title matches'
          )}
        </button>
        <label className="btn btn-tonal btn-sm cfg-upload" data-label-wrap>
          {t(
            'components.IdentityMappingPackControls.importLabel',
            'Choose a SeerrNG title-match pack'
          )}
          <input
            ref={input}
            type="file"
            className="sr"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
      </div>
      {draft && (
        <>
          <p className="note">
            {t(
              'components.IdentityMappingPackControls.fileSummary',
              '{name} contains {count} title matches.',
              { name: draft.name, count: draft.count }
            )}{' '}
            {t(
              'components.IdentityMappingPackControls.importDescription',
              'Import adds new matches and updates matches with the same provider item. All imported matches remain private to your account.'
            )}
          </p>
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void importPack()}
            >
              {t(
                'components.IdentityMappingPackControls.import',
                'Import title matches'
              )}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => {
                clear();
                setFailure('');
              }}
            >
              {t(
                'components.IdentityMappingPackControls.clear',
                'Clear selected file'
              )}
            </button>
          </div>
        </>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
    </Section>
  );
}
