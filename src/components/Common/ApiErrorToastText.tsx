import ApiMessageText from '@app/components/Common/ApiMessageText';
import OpaqueApiMessageText from '@app/components/Common/OpaqueApiMessageText';

const stringParams = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
};

/** Render API toast text only from its explicit producer provenance. */
export default function ApiErrorToastText({
  message,
  messageOrigin,
  messageKey,
  messageParams,
}: {
  message: string;
  messageOrigin?: unknown;
  messageKey?: unknown;
  messageParams?: unknown;
}) {
  if (messageOrigin !== 'app') {
    return <OpaqueApiMessageText>{message}</OpaqueApiMessageText>;
  }

  const params = stringParams(messageParams);
  if (typeof messageKey === 'string') {
    return (
      <ApiMessageText trustedKey={messageKey} trustedParams={params}>
        {message}
      </ApiMessageText>
    );
  }
  return <ApiMessageText>{message}</ApiMessageText>;
}
