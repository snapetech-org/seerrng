import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const MAX_PACK_BYTES = 5 * 1024 * 1024;
const MAX_PACK_ENTRIES = 10_000;
const packUrl = '/api/v1/integrations/discovery/mappings/pack';

const messages = defineMessages('components.IdentityMappingPackControls', {
  title: 'Personal title matches',
  description:
    'Export or restore your private matches for Trakt, AniList, Simkl, MDBList, Plex, Jellyfin, and Emby titles.',
  privacy:
    'Packs contain provider item IDs and catalog matches only. Account credentials are never included.',
  export: 'Export title matches',
  exportFailed: 'Your title matches could not be exported. Try again.',
  importLabel: 'Choose a SeerrNG title-match pack',
  invalidFile: 'Choose a supported SeerrNG title-match JSON file.',
  fileTooLarge: 'The title-match file must be 5 MiB or smaller.',
  fileSummary: '{name} contains {count} title matches.',
  importDescription:
    'Import adds new matches and updates matches with the same provider item. All imported matches remain private to your account.',
  import: 'Import title matches',
  clear: 'Clear selected file',
  importing: 'Importing…',
  imported:
    'Imported {imported}, updated {updated}, and left {unchanged} unchanged.',
  importFailed:
    'The title-match pack could not be imported. Check the file and try again.',
});

interface SelectedPack {
  name: string;
  contents: string;
  entryCount: number;
}

function previewEntryCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid pack');
  const pack = value as Record<string, unknown>;
  if (
    pack.format !== 'seerrng.personal-title-matches' ||
    pack.version !== 1 ||
    !Array.isArray(pack.entries) ||
    pack.entries.length > MAX_PACK_ENTRIES
  )
    throw new Error('unsupported pack');
  return pack.entries.length;
}

export default function IdentityMappingPackControls({
  onUpdated,
}: {
  onUpdated: () => Promise<unknown>;
}) {
  const intl = useIntl();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedPack, setSelectedPack] = useState<SelectedPack>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const chooseFile = async (file?: File) => {
    setNotice('');
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
      const entryCount = previewEntryCount(JSON.parse(contents));
      setSelectedPack({ name: file.name, contents, entryCount });
    } catch {
      setSelectedPack(undefined);
      setNotice(intl.formatMessage(messages.invalidFile));
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const exportPack = async () => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await axios.get(packUrl);
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `seerrng-title-matches-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setNotice(intl.formatMessage(messages.exportFailed));
    } finally {
      setBusy(false);
    }
  };

  const importPack = async () => {
    if (!selectedPack || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await axios.post(packUrl, selectedPack.contents, {
        headers: { 'Content-Type': 'text/plain' },
      });
      setNotice(
        intl.formatMessage(messages.imported, {
          imported: response.data.imported,
          updated: response.data.updated,
          unchanged: response.data.unchanged,
        })
      );
      setSelectedPack(undefined);
      if (fileInput.current) fileInput.current.value = '';
      void onUpdated().catch(() => undefined);
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? error.response?.data?.message
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

  return (
    <section
      aria-labelledby="identity-mapping-pack-title"
      className="mb-6 space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4"
    >
      <h2 id="identity-mapping-pack-title" className="text-lg font-semibold">
        {intl.formatMessage(messages.title)}
      </h2>
      <p className="text-sm text-gray-300">
        {intl.formatMessage(messages.description)}
      </p>
      <p className="text-xs text-gray-400">
        {intl.formatMessage(messages.privacy)}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Button disabled={busy} onClick={() => void exportPack()}>
          {intl.formatMessage(messages.export)}
        </Button>
        <label
          className="min-w-0 flex-1 text-sm"
          htmlFor="identity-mapping-pack"
        >
          {intl.formatMessage(messages.importLabel)}
          <input
            ref={fileInput}
            id="identity-mapping-pack"
            className="mt-2 block w-full"
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
        </label>
      </div>
      {selectedPack && (
        <div className="space-y-2 rounded-md border border-gray-700 p-3">
          <p className="text-sm text-gray-200">
            {intl.formatMessage(messages.fileSummary, {
              name: selectedPack.name,
              count: selectedPack.entryCount,
            })}
          </p>
          <p className="text-xs text-gray-400">
            {intl.formatMessage(messages.importDescription)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void importPack()}>
              {intl.formatMessage(messages.import)}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setSelectedPack(undefined);
                setNotice('');
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              {intl.formatMessage(messages.clear)}
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-gray-300">
          {<ApiMessageText>{notice}</ApiMessageText>}
        </p>
      )}
    </section>
  );
}
