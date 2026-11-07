import MediaDetailArtwork from '@app/components/MediaDetails/MediaDetailArtwork';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
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
}: RequestMediaCardProps) => {
  const upstream = useUpstreamTheme();
  return (
    <article
      data-theme-part="request-media-card"
      className="media-detail-card app-card-main card-layout refreshed-card-surface"
    >
      {!upstream && artwork && (
        <MediaDetailArtwork type={artworkType} src={artwork} />
      )}
      <div data-card-part="content">{children}</div>
    </article>
  );
};

export default RequestMediaCard;
