import CompanyCard from '@app/components/CompanyCard';
import Slider from '@app/components/Slider';
import defineMessages from '@app/utils/defineMessages';
import type { DiscoverNetworkData } from '@server/constants/discover';
import { readDiscoverNetworkList } from '@server/lib/discoverNetworks';
import { useIntl } from 'react-intl';

import { tvNetworks } from '@lumen/discoverNetworks';

const messages = defineMessages('components.Discover.NetworkSlider', {
  networks: 'Networks',
  empty: 'No Networks Selected',
});

export { tvNetworks };

export const defaultDiscoverNetworks: DiscoverNetworkData[] = tvNetworks.map(
  (network) => {
    const imagePath = new URL(network.image).pathname;
    const logoBasePath = '/t/p/original';

    return {
      id: Number(network.url.slice(network.url.lastIndexOf('/') + 1)),
      name: network.name,
      logoPath: imagePath.startsWith(`${logoBasePath}/`)
        ? imagePath.slice(logoBasePath.length)
        : '',
      logoTone: network.logoTone,
    };
  }
);

const NetworkSlider = ({ data }: { data?: string }) => {
  const intl = useIntl();
  const { networks } = readDiscoverNetworkList(data, defaultDiscoverNetworks);

  return (
    <div>
      <Slider
        heading={
          <>
            <div className="page-heading">
              <span>{intl.formatMessage(messages.networks)}</span>
            </div>
          </>
        }
        compact
        sliderKey="networks"
        isLoading={false}
        isEmpty={networks.length === 0}
        items={networks.map((network) => (
          <CompanyCard
            key={`network-${network.id}`}
            name={network.name}
            image={`https://image.tmdb.org/t/p/original${network.logoPath}`}
            url={`/discover/tv/network/${network.id}`}
            logoTone={network.logoTone}
          />
        ))}
        placeholder={<CompanyCardPlaceholder />}
        emptyMessage={intl.formatMessage(messages.empty)}
      />
    </div>
  );
};

const CompanyCardPlaceholder = () => (
  <div className="h-16 w-28 animate-pulse rounded-xl bg-gray-700 sm:h-[72px] sm:w-36" />
);

export default NetworkSlider;
