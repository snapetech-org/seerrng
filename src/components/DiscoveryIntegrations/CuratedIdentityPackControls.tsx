import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const MAX_PACK_BYTES = 5 * 1024 * 1024;
const MAX_PACK_ENTRIES = 10_000;
const endpoint = '/api/v1/integrations/discovery/mappings/packs';

const messages = defineMessages('components.CuratedIdentityPackControls', {
  title: 'Shared discovery title matches',
  description:
    'Administrators can publish catalog matches for discovery feeds and linked libraries across this SeerrNG instance.',
  sharedWarning:
    'Every pack below affects all accounts on this SeerrNG instance. A user’s private title match takes precedence over a shared pack.',
  fileLabel: 'Choose a SeerrNG shared title-match pack',
  fileTooLarge: 'The shared title-match file must be 5 MiB or smaller.',
  invalidFile: 'Choose a supported SeerrNG shared title-match JSON file.',
  fileSummary: '{name} ({packId}) contains {count} title matches.',
  replaceWarning:
    'Publishing this pack replaces all entries in the shared pack with the same ID and changes matches for every account.',
  acknowledge:
    'I understand this shared pack applies to every account on this instance.',
  publish: 'Publish shared pack',
  replace: 'Replace shared pack',
  clear: 'Clear selected file',
  published:
    'Shared pack “{name}” saved. Entries: {total} ({imported} new, {updated} changed, {unchanged} unchanged, {removed} removed).',
  importFailed:
    'The shared pack could not be published. Check the file and try again.',
  reloadFailed: 'Shared packs could not be loaded.',
  noPacks: 'No shared title-match packs have been published.',
  listTitle: 'Published packs',
  entryCount: '{count} title matches',
  updatedAt: 'Updated {date}',
  download: 'Download pack',
  downloadFailed: 'The shared pack could not be downloaded. Try again.',
  delete: 'Delete pack',
  deleteWarning:
    'Deleting “{name}” removes its shared matches for every account on this instance.',
  confirmDelete: 'Delete shared pack',
  cancelDelete: 'Keep shared pack',
  deleted: 'Shared pack “{name}” was deleted for every account.',
  deleteFailed: 'The shared pack could not be deleted. Try again.',
  acknowledgeDelete:
    'This deletion removes the shared matches from discovery results for all accounts.',
});

interface CuratedPackSummary {
  packId: string;
  name: string;
  version: number;
  count: number;
  updatedAt: string;
}

interface SelectedPack {
  name: string;
  packId: string;
  contents: string;
  entryCount: number;
  replacesExisting: boolean;
}

interface SharedPacksResponse {
  packs: CuratedPackSummary[];
}

function previewPack(value: unknown): Omit<
  SelectedPack,
  'contents' | 'replacesExisting' | 'name'
> & {
  name: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid pack');
  const pack = value as Record<string, unknown>;
  if (
    pack.format !== 'seerrng.curated-title-matches' ||
    pack.version !== 1 ||
    typeof pack.packId !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(pack.packId) ||
    typeof pack.name !== 'string' ||
    !pack.name.trim() ||
    !Array.isArray(pack.entries) ||
    pack.entries.length > MAX_PACK_ENTRIES
  )
    throw new Error('unsupported pack');
  return {
    name: pack.name.trim(),
    packId: pack.packId,
    entryCount: pack.entries.length,
  };
}

export default function CuratedIdentityPackControls() {
  const intl = useIntl();
  const fileInput = useRef<HTMLInputElement>(null);
  const { data, error, mutate } = useSWR<SharedPacksResponse>(endpoint);
  const [selectedPack, setSelectedPack] = useState<SelectedPack>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [deletePack, setDeletePack] = useState<CuratedPackSummary>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const chooseFile = async (file?: File) => {
    setNotice('');
    setAcknowledged(false);
    if (!file) {
      setSelectedPack(undefined);
      return;
    }
    if (file.size > MAX_PACK_BYTES) {
      setSelectedPack(undefined);
      setNotice(intl.formatMessage(messages.fileTooLarge));
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    try {
      const contents = await file.text();
      const preview = previewPack(JSON.parse(contents));
      setSelectedPack({
        ...preview,
        contents,
        replacesExisting: (data?.packs ?? []).some(
          (pack) => pack.packId === preview.packId
        ),
      });
    } catch {
      setSelectedPack(undefined);
      setNotice(intl.formatMessage(messages.invalidFile));
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const publishPack = async () => {
    if (!selectedPack || busy || !acknowledged) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await axios.post(endpoint, selectedPack.contents, {
        headers: { 'Content-Type': 'text/plain' },
      });
      setNotice(
        intl.formatMessage(messages.published, {
          name: response.data.name,
          total: response.data.total,
          imported: response.data.imported,
          updated: response.data.updated,
          unchanged: response.data.unchanged,
          removed: response.data.removed,
        })
      );
      setSelectedPack(undefined);
      setAcknowledged(false);
      if (fileInput.current) fileInput.current.value = '';
      await mutate().catch(() => undefined);
    } catch (requestError) {
      const detail = axios.isAxiosError(requestError)
        ? requestError.response?.data?.message
        : undefined;
      setNotice(
        typeof detail === 'string'
          ? detail
          : intl.formatMessage(messages.importFailed)
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadPack = async (pack: CuratedPackSummary) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await axios.get(
        `${endpoint}/${encodeURIComponent(pack.packId)}`
      );
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `seerrng-${pack.packId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setNotice(intl.formatMessage(messages.downloadFailed));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletePack || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await axios.delete(
        `${endpoint}/${encodeURIComponent(deletePack.packId)}`
      );
      setNotice(
        intl.formatMessage(messages.deleted, { name: deletePack.name })
      );
      setDeletePack(undefined);
      await mutate().catch(() => undefined);
    } catch {
      setNotice(intl.formatMessage(messages.deleteFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="curated-identity-pack-title"
      className="mt-8 space-y-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4 sm:p-5"
    >
      <div>
        <h4 id="curated-identity-pack-title" className="text-lg font-semibold">
          {intl.formatMessage(messages.title)}
        </h4>
        <p className="mt-1 text-sm text-gray-300">
          {intl.formatMessage(messages.description)}
        </p>
        <p
          role="note"
          className="mt-2 rounded border border-yellow-700/70 bg-yellow-950/40 p-3 text-sm text-yellow-100"
        >
          {intl.formatMessage(messages.sharedWarning)}
        </p>
      </div>

      <label className="block text-sm" htmlFor="curated-identity-pack-file">
        {intl.formatMessage(messages.fileLabel)}
        <input
          ref={fileInput}
          id="curated-identity-pack-file"
          className="mt-2 block w-full"
          type="file"
          accept="application/json,.json"
          disabled={busy || !data}
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
      </label>

      {selectedPack && (
        <div className="space-y-3 rounded-md border border-gray-700 p-3">
          <p className="text-sm text-gray-200">
            {intl.formatMessage(messages.fileSummary, {
              name: selectedPack.name,
              packId: selectedPack.packId,
              count: selectedPack.entryCount,
            })}
          </p>
          <p className="text-sm text-yellow-100">
            {intl.formatMessage(messages.replaceWarning)}
          </p>
          {selectedPack.replacesExisting && (
            <p className="text-sm text-yellow-100">
              {intl.formatMessage(messages.replace)}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              disabled={busy}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{intl.formatMessage(messages.acknowledge)}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              buttonType="primary"
              disabled={busy || !acknowledged}
              onClick={() => void publishPack()}
            >
              {intl.formatMessage(
                selectedPack.replacesExisting
                  ? messages.replace
                  : messages.publish
              )}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setSelectedPack(undefined);
                setAcknowledged(false);
                setNotice('');
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              {intl.formatMessage(messages.clear)}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h5 className="font-semibold">
          {intl.formatMessage(messages.listTitle)}
        </h5>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {intl.formatMessage(messages.reloadFailed)}
          </p>
        )}
        {data?.packs.length === 0 && (
          <p className="text-sm text-gray-400">
            {intl.formatMessage(messages.noPacks)}
          </p>
        )}
        {data?.packs.map((pack) => (
          <div
            key={pack.packId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-700 p-3"
          >
            <div className="min-w-0">
              <p className="font-medium break-words">
                {pack.name}{' '}
                <span className="text-gray-400">({pack.packId})</span>
              </p>
              <p className="text-sm text-gray-400">
                {intl.formatMessage(messages.entryCount, { count: pack.count })}
                {' · '}
                {intl.formatMessage(messages.updatedAt, {
                  date: intl.formatDate(pack.updatedAt),
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void downloadPack(pack)}>
                {intl.formatMessage(messages.download)}
              </Button>
              <Button
                buttonType="danger"
                disabled={busy}
                onClick={() => setDeletePack(pack)}
              >
                {intl.formatMessage(messages.delete)}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {deletePack && (
        <div
          role="alert"
          className="space-y-3 rounded border border-red-800 bg-red-950/40 p-3"
        >
          <p className="text-sm text-red-100">
            {intl.formatMessage(messages.deleteWarning, {
              name: deletePack.name,
            })}
          </p>
          <p className="text-xs text-red-200">
            {intl.formatMessage(messages.acknowledgeDelete)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              buttonType="danger"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {intl.formatMessage(messages.confirmDelete)}
            </Button>
            <Button disabled={busy} onClick={() => setDeletePack(undefined)}>
              {intl.formatMessage(messages.cancelDelete)}
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm text-gray-200">
          {<ApiMessageText>{notice}</ApiMessageText>}
        </p>
      )}
    </section>
  );
}
