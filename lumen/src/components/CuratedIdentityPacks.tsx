import { useRef, useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ServiceNote } from './extra';

const path = '/integrations/discovery/mappings/packs';
const maxBytes = 5 * 1024 * 1024;
interface Pack {
  packId: string;
  name: string;
  count: number;
}
interface Draft extends Pack {
  contents: string;
}

async function readPack(file: File): Promise<Draft> {
  if (file.size > maxBytes)
    throw new Error('The pack must be 5 MiB or smaller.');
  const contents = await file.text();
  let pack;
  try {
    pack = JSON.parse(contents);
  } catch {
    throw new Error('Choose a supported title-match pack JSON file.');
  }
  if (
    pack?.format !== 'seerrng.curated-title-matches' ||
    pack.version !== 1 ||
    typeof pack.packId !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(pack.packId) ||
    typeof pack.name !== 'string' ||
    !pack.name.trim() ||
    !Array.isArray(pack.entries) ||
    pack.entries.length > 10000
  ) {
    throw new Error('Choose a supported title-match pack JSON file.');
  }
  return {
    packId: pack.packId,
    name: pack.name.trim(),
    count: pack.entries.length,
    contents,
  };
}

export default function CuratedIdentityPacks() {
  const { data, error, reload, refresh } = useApi<{ packs: Pack[] }>(path, {
    keepDuringRefresh: true,
  });
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [removal, setRemoval] = useState<Pack>();
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');

  function clearDraft() {
    setDraft(undefined);
    setAcknowledged(false);
    if (input.current) input.current.value = '';
  }

  async function run(action: () => Promise<void>, fallback: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    const generation = sessionGeneration();
    try {
      await action();
    } catch {
      if (generation === sessionGeneration()) setFailure(fallback);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function choose(file?: File) {
    setDraft(undefined);
    setAcknowledged(false);
    if (!file) return;
    await run(async () => {
      try {
        setDraft(await readPack(file));
      } catch (error) {
        clearDraft();
        setFailure(
          error instanceof Error
            ? error.message
            : 'Could not read the selected file.'
        );
      }
    }, 'Could not read the selected file.');
  }

  async function publish() {
    if (!draft || !acknowledged) return;
    const generation = sessionGeneration();
    await run(async () => {
      const result = await api<{
        total: number;
        imported: number;
        updated: number;
        unchanged: number;
        removed: number;
      }>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: draft.contents,
      });
      if (generation !== sessionGeneration()) return;
      setNotice(
        `Published ${draft.name}. ${result.total} matches, ${result.imported} new, ${result.updated} changed, ${result.unchanged} unchanged, ${result.removed} removed.`
      );
      clearDraft();
      refresh();
    }, 'Could not publish the pack. Check the file and try again.');
  }

  async function download(pack: Pack) {
    const generation = sessionGeneration();
    await run(async () => {
      const contents = await api<unknown>(
        `${path}/${encodeURIComponent(pack.packId)}`
      );
      if (generation !== sessionGeneration()) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(contents, null, 2)], {
          type: 'application/json',
        })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `seerrng-${pack.packId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Could not download the pack. Try again.');
  }

  async function remove(pack: Pack) {
    const generation = sessionGeneration();
    await run(async () => {
      await api(`${path}/${encodeURIComponent(pack.packId)}`, {
        method: 'DELETE',
      });
      if (generation !== sessionGeneration()) return;
      setRemoval(undefined);
      setNotice(`Deleted ${pack.name} for every account.`);
      refresh();
    }, 'Could not delete the pack. Try again.');
  }

  const replaces = data?.packs.some((pack) => pack.packId === draft?.packId);
  return (
    <Section title="Shared Discovery Title Matches">
      <p className="note">
        Shared packs apply to every account. A user’s private match takes
        precedence.
      </p>
      <ServiceNote
        error={error}
        what="shared title-match packs"
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          Loading shared packs…
        </p>
      )}
      <div className="toolbar">
        <label className="btn btn-tonal btn-sm cfg-upload">
          Choose Pack File
          <input
            ref={input}
            type="file"
            className="sr"
            accept="application/json,.json"
            disabled={busy || !data}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </label>
      </div>
      {draft && (
        <>
          <p className="note">
            {draft.name} ({draft.packId}) contains {draft.count} title matches.
          </p>
          <p className="note">
            Publishing replaces all entries in any existing pack with this ID.
          </p>
          <div className="setlist">
            <label className="set cfg-row">
              <span>I understand this pack applies to every account.</span>
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
            </label>
          </div>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !acknowledged}
              onClick={() => void publish()}
            >
              {replaces ? 'Replace Shared Pack' : 'Publish Shared Pack'}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={clearDraft}
            >
              Clear Selected File
            </button>
          </div>
        </>
      )}
      {data?.packs.length === 0 && (
        <p className="note">No shared packs have been published.</p>
      )}
      <div className="setlist">
        {data?.packs.map((pack) => (
          <div className="set cfg-row" key={pack.packId}>
            <span>
              <b>{pack.name}</b>
              <small>
                {pack.packId} · {pack.count} title matches
              </small>
            </span>
            <div className="toolbar">
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => void download(pack)}
              >
                Download Pack
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setRemoval(pack)}
              >
                Delete Pack
              </button>
            </div>
          </div>
        ))}
      </div>
      {removal && (
        <>
          <p className="note" role="alert">
            Deleting {removal.name} removes its shared matches for every
            account.
          </p>
          <div className="toolbar">
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void remove(removal)}
            >
              Delete Shared Pack
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setRemoval(undefined)}
            >
              Keep Shared Pack
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
