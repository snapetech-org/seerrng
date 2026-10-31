import CachedImage from '@app/components/Common/CachedImage';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { UserCircleIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useState } from 'react';

interface PersonCardProps {
  personId: number;
  name: string;
  subName?: string;
  profilePath?: string;
  canExpand?: boolean;
}

const PersonCard = ({
  personId,
  name,
  subName,
  profilePath,
}: PersonCardProps) => {
  const [isHovered, setHovered] = useState(false);

  return (
    <Link
      href={`/person/${personId}`}
      prefetch={false}
      className="poster-layout"
      data-media-type="person"
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setHovered(true);
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div
        data-poster-region="frame"
        className={`app-card-poster app-card-poster-interactive ${
          isHovered ? 'app-card-poster-active' : ''
        }`}
      >
        <div data-poster-region="content">
          <div className="flex h-full w-full flex-col items-center p-2">
            <div className="relative mt-2 mb-4 flex h-1/2 w-full justify-center">
              {profilePath ? (
                <div className="relative h-full w-3/4 overflow-hidden rounded-full ring-1 ring-gray-700">
                  <CachedImage
                    type="tmdb"
                    src={getTmdbPosterImageUrl(
                      profilePath,
                      'w600_and_h900_bestv2'
                    )}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    fill
                  />
                </div>
              ) : (
                <UserCircleIcon className="h-full" />
              )}
            </div>
            <div
              className="card-title w-full truncate text-center"
              data-title-weight="regular"
            >
              {name}
            </div>
            {subName && (
              <div
                className="overflow-hidden text-center text-sm whitespace-normal text-gray-300"
                style={{
                  WebkitLineClamp: 2,
                  display: '-webkit-box',
                  overflow: 'hidden',
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {subName}
              </div>
            )}
            <div
              className={`absolute start-0 end-0 bottom-0 h-12 rounded-b-xl bg-gradient-to-t ${
                isHovered ? 'from-gray-800' : 'from-gray-900'
              }`}
            />
          </div>
        </div>
      </div>
    </Link>
  );
};

export default PersonCard;
