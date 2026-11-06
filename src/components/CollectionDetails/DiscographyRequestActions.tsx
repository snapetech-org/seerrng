import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import FormatRequestControl from '@app/components/Common/FormatRequestControl';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isMusicServiceForQuality } from '@app/utils/musicService';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { BulkMediaRequestResponse } from '@server/interfaces/api/requestInterfaces';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type { CuratedCollectionMember } from '@server/models/CuratedCollection';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.DiscographyRequestActions', {
  unavailable: 'No {format} service is configured.',
  select: 'Select at least one album.',
  confirm:
    'Request {count} selected {count, plural, one {album} other {albums}} as {format}?',
  summary: '{created} created, {skipped} skipped, {failed} failed.',
  failed:
    'The request could not be completed. Check request history before retrying.',
});

export default function DiscographyRequestActions({
  items,
  returnHref,
}: {
  items: CuratedCollectionMember[];
  returnHref: string;
}) {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const { data: services } = useSWR<ServiceCommonServer[]>(
    '/api/v1/service/lidarr'
  );
  const [pending, setPending] = useState<{
    format: string;
    serverId: number;
    ids: string;
  }>();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [result, setResult] = useState<BulkMediaRequestResponse>();
  const [error, setError] = useState(false);
  const ids = items.map((item) => item.id).join(',');
  useEffect(() => {
    setPending((current) => (current?.ids === ids ? current : undefined));
  }, [ids]);
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MUSIC],
    {
      type: 'or',
    }
  );
  const confirmation = pending?.ids === ids ? pending : undefined;

  const submit = async () => {
    if (!confirmation || !items.length || !canRequest || submitting.current)
      return;
    submitting.current = true;
    setBusy(true);
    setError(false);
    const summary: BulkMediaRequestResponse = {
      created: [],
      skipped: [],
      failed: [],
    };
    setResult(undefined);
    try {
      for (let offset = 0; offset < items.length; offset += 50) {
        const { data } = await axios.post<BulkMediaRequestResponse>(
          '/api/v1/request/bulk',
          {
            mediaType: 'music',
            serverId: confirmation.serverId,
            items: items.slice(offset, offset + 50).map((item) => ({
              mediaId: item.id,
              title: item.title,
            })),
          }
        );
        summary.created.push(...data.created);
        summary.skipped.push(...data.skipped);
        summary.failed.push(...data.failed);
        setResult({ ...summary });
      }
    } catch {
      setError(true);
    } finally {
      void mutate('/api/v1/request/count');
      setPending(undefined);
      setBusy(false);
      submitting.current = false;
    }
  };

  return (
    <div className="discography-request-actions">
      <Button
        buttonType="danger"
        disabled={busy}
        onClick={() => void router.replace(returnHref)}
      >
        <XMarkIcon />
        <span>{intl.formatMessage(globalMessages.cancel)}</span>
      </Button>
      {canRequest && (
        <FormatRequestControl
          options={(['mp3', 'flac'] as const).map((format) => {
            const service = services?.find((candidate) =>
              isMusicServiceForQuality(candidate, format)
            );
            return {
              id: format,
              label: format.toUpperCase(),
              disabled: busy || !service || !items.length,
              disabledReason: !service
                ? intl.formatMessage(messages.unavailable, {
                    format: format.toUpperCase(),
                  })
                : !items.length
                  ? intl.formatMessage(messages.select)
                  : undefined,
              onClick: () => {
                if (service) {
                  setPending({
                    format: format.toUpperCase(),
                    serverId: service.id,
                    ids,
                  });
                  setResult(undefined);
                  setError(false);
                }
              },
            };
          })}
        />
      )}
      {confirmation && (
        <div className="discography-request-feedback" role="status">
          <Button
            buttonType="primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy
              ? intl.formatMessage(globalMessages.requesting)
              : intl.formatMessage(messages.confirm, {
                  count: items.length,
                  format: confirmation.format,
                })}
          </Button>
        </div>
      )}
      {result && (
        <div className="discography-request-feedback" role="status">
          {intl.formatMessage(messages.summary, {
            created: result.created.length,
            skipped: result.skipped.length,
            failed: result.failed.length,
          })}
          {[...result.skipped, ...result.failed].map((item) => (
            <div key={item.mediaId}>
              {item.title ?? item.mediaId}:{' '}
              <ApiMessageText>{item.reason}</ApiMessageText>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="discography-request-feedback" role="alert">
          {intl.formatMessage(messages.failed)}
        </p>
      )}
    </div>
  );
}
