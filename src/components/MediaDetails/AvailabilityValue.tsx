import { MediaStatus } from '@server/constants/media';
import type { ReactNode } from 'react';

export type MediaAvailabilityTone =
  'available' | 'processing' | 'shared' | 'unavailable';

export const getMediaAvailabilityTone = (
  status: MediaStatus | undefined
): MediaAvailabilityTone => {
  switch (status) {
    case MediaStatus.AVAILABLE:
    case MediaStatus.PARTIALLY_AVAILABLE:
      return 'available';
    case MediaStatus.PROCESSING:
    case MediaStatus.PENDING:
      return 'processing';
    default:
      return 'unavailable';
  }
};

const toneClasses: Record<MediaAvailabilityTone, string> = {
  available: 'text-emerald-300',
  processing: 'text-amber-300',
  shared: 'detail-availability-shared',
  unavailable: 'text-red-300',
};

interface AvailabilityValueProps {
  children: ReactNode;
  status?: MediaStatus;
  tone?: MediaAvailabilityTone;
  className?: string;
}

const AvailabilityValue = ({
  children,
  status,
  tone,
  className,
}: AvailabilityValueProps) => {
  const resolvedTone = tone ?? getMediaAvailabilityTone(status);

  return (
    <span
      className={[toneClasses[resolvedTone], className]
        .filter(Boolean)
        .join(' ')}
      data-availability-tone={resolvedTone}
    >
      {children}
    </span>
  );
};

export default AvailabilityValue;
