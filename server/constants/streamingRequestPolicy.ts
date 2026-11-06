export type StreamingRequestAvailabilityCondition = 'available' | 'unavailable';

export type StreamingRequestPolicyAction = 'reject' | 'pending' | 'approve';

export interface StreamingRequestPolicySettings {
  enabled: boolean;
  condition: StreamingRequestAvailabilityCondition;
  action: StreamingRequestPolicyAction;
  rejectionMessage: string;
  allowUserOverride: boolean;
}

export const DEFAULT_STREAMING_REQUEST_POLICY: StreamingRequestPolicySettings =
  {
    enabled: false,
    condition: 'available',
    action: 'reject',
    rejectionMessage: '',
    allowUserOverride: false,
  };

export const MAX_STREAMING_SUBSCRIPTION_PROVIDERS = 500;
export const MAX_STREAMING_REQUEST_REJECTION_MESSAGE_LENGTH = 1000;
