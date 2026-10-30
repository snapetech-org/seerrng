import MediaDetailArtwork from '@app/components/MediaDetails/MediaDetailArtwork';
import type { CacheableImageType } from '@app/utils/imageCache';
import type { ReactNode } from 'react';

interface RequestMediaCardProps {
  artwork?: string | null;
  artworkType: CacheableImageType;
  children: ReactNode;
}

const RequestMediaCard = ({
  artwork,
  artworkType,
  children,
}: RequestMediaCardProps) => (
  <article className="request-media-card media-detail-card app-card-main card-layout refreshed-card-surface">
    {artwork && <MediaDetailArtwork type={artworkType} src={artwork} />}
    <div data-card-part="content">{children}</div>
  </article>
);

export default RequestMediaCard;
