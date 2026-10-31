import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import {
  DEFAULT_STREAMING_REQUEST_POLICY,
  MAX_STREAMING_REQUEST_REJECTION_MESSAGE_LENGTH,
  type StreamingRequestPolicyAction,
  type StreamingRequestPolicySettings,
} from '@server/constants/streamingRequestPolicy';

export interface StreamingRequestPolicyMatch {
  action: StreamingRequestPolicyAction;
  region: string;
  providerNames: string[];
}

export class StreamingRequestPolicyRejection extends Error {
  public constructor(
    message: string,
    public readonly allowUserOverride: boolean
  ) {
    super(message);
    this.name = 'StreamingRequestPolicyRejection';
  }
}

export const normalizeStreamingRequestPolicy = (
  policy?: Partial<StreamingRequestPolicySettings> | null
): StreamingRequestPolicySettings => {
  const incoming = policy ?? {};

  return {
    enabled: incoming.enabled === true,
    condition:
      incoming.condition === 'available' || incoming.condition === 'unavailable'
        ? incoming.condition
        : DEFAULT_STREAMING_REQUEST_POLICY.condition,
    action:
      incoming.action === 'reject' ||
      incoming.action === 'pending' ||
      incoming.action === 'approve'
        ? incoming.action
        : DEFAULT_STREAMING_REQUEST_POLICY.action,
    rejectionMessage:
      typeof incoming.rejectionMessage === 'string'
        ? incoming.rejectionMessage.slice(
            0,
            MAX_STREAMING_REQUEST_REJECTION_MESSAGE_LENGTH
          )
        : DEFAULT_STREAMING_REQUEST_POLICY.rejectionMessage,
    allowUserOverride: incoming.allowUserOverride === true,
  };
};

export const evaluateStreamingRequestPolicy = ({
  policy: rawPolicy,
  providerIds,
  userRegion,
  defaultRegion,
  media,
}: {
  policy?: Partial<StreamingRequestPolicySettings> | null;
  providerIds?: number[] | null;
  userRegion?: string | null;
  defaultRegion?: string | null;
  media: TmdbMovieDetails | TmdbTvDetails;
}): StreamingRequestPolicyMatch | undefined => {
  const policy = normalizeStreamingRequestPolicy(rawPolicy);
  const subscriptions = Array.isArray(providerIds)
    ? new Set(
        providerIds.filter(
          (providerId) => Number.isSafeInteger(providerId) && providerId > 0
        )
      )
    : new Set<number>();

  if (!policy.enabled || subscriptions.size === 0) {
    return undefined;
  }

  const regionValue =
    typeof userRegion === 'string' && userRegion.trim()
      ? userRegion
      : typeof defaultRegion === 'string' && defaultRegion.trim()
        ? defaultRegion
        : 'US';
  const region = regionValue.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) {
    return undefined;
  }

  const regionalAvailability = media['watch/providers']?.results?.[region];
  if (!regionalAvailability) {
    return undefined;
  }

  const matchedProviders = (regionalAvailability.flatrate ?? []).filter(
    (provider) => subscriptions.has(provider.provider_id)
  );
  const isAvailable = matchedProviders.length > 0;
  const conditionMatches =
    policy.condition === 'available' ? isAvailable : !isAvailable;

  return conditionMatches
    ? {
        action: policy.action,
        region,
        providerNames: matchedProviders.map(
          (provider) => provider.provider_name
        ),
      }
    : undefined;
};

export const formatStreamingRequestRejectionMessage = ({
  policy: rawPolicy,
  match,
  title,
}: {
  policy?: Partial<StreamingRequestPolicySettings> | null;
  match: StreamingRequestPolicyMatch;
  title: string;
}): string => {
  const policy = normalizeStreamingRequestPolicy(rawPolicy);
  const fallbackMessage =
    policy.condition === 'available'
      ? 'This title is available through a streaming service you selected in {region}.'
      : 'This title is not available through the streaming services you selected in {region}.';
  const template = policy.rejectionMessage.trim() || fallbackMessage;
  const values: Record<string, string> = {
    title,
    providers: match.providerNames.join(', '),
    region: match.region,
  };

  return template.replace(
    /\{(title|providers|region)\}/g,
    (_token, key: string) => values[key]
  );
};
