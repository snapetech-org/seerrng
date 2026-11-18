import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';

const path = '/integrations/discovery/mappings/pack';
type Draft = { name: string; contents: string; count: number };

export default function PersonalIdentityPacks({
  onImported,
}: {
  onImported: () => void;
}) {
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
            throw new Error('The title-match file must be 5 MiB or smaller.');
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
              'Choose a supported personal title-match JSON file.'
            );
          return { name: file.name, contents, count: pack.entries.length };
        } catch (error) {
          clear();
          if (error instanceof SyntaxError)
            throw new Error(
              'Choose a supported personal title-match JSON file.',
              { cause: error }
            );
          throw error;
        }
      },
      setDraft,
      'Could not read the title-match file.'
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
          `Imported ${imported}, updated ${updated}, and left ${unchanged} unchanged.`
        );
        onImported();
      },
      'Could not import the title-match file.'
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
      'Could not export your title matches.'
    );
  }

  return (
    <Section title="Personal Title Matches">
      <p className="note">Back up or restore your private catalog matches.</p>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => void exportPack()}
        >
          Export Title Matches
        </button>
        <label className="btn btn-tonal btn-sm cfg-upload">
          Choose Personal Pack
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
            {draft.name} contains {draft.count}{' '}
            {draft.count === 1 ? 'title match' : 'title matches'}. Import
            updates any existing matches for the same provider items.
          </p>
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void importPack()}
            >
              Import Title Matches
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => {
                clear();
                setFailure('');
              }}
            >
              Clear Selected File
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
