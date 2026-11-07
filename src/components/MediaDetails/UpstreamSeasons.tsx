import Season from '@app/components/TvDetails/Season';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type { TvDetails } from '@server/models/Tv';

/** Upstream's expand-to-read season flow; playback selection stays in its native tool. */
export default function UpstreamSeasons({
  tvId,
  seasons,
}: {
  tvId: number;
  seasons: TvDetails['seasons'];
}) {
  return (
    <div className="upstream-seasons">
      {seasons
        .filter((season) => season.episodeCount > 0)
        .map((season) => (
          <Disclosure as="section" key={season.id} className="upstream-season">
            <DisclosureButton className="upstream-season-toggle">
              <span>{season.name}</span>
              <span className="upstream-season-count">
                {season.episodeCount}
              </span>
              <ChevronDownIcon aria-hidden="true" />
            </DisclosureButton>
            <DisclosurePanel className="upstream-season-panel">
              <Season tvId={tvId} seasonNumber={season.seasonNumber} />
            </DisclosurePanel>
          </Disclosure>
        ))}
    </div>
  );
}
