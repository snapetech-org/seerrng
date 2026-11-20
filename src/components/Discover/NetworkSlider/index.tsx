import CompanyCard from '@app/components/CompanyCard';
import Slider from '@app/components/Slider';
import defineMessages from '@app/utils/defineMessages';
import { readDiscoverNetworkList } from '@server/lib/discoverNetworks';
import { useIntl } from 'react-intl';

import { defaultDiscoverNetworks, tvNetworks } from '@lumen/discoverNetworks';

const messages = defineMessages('components.Discover.NetworkSlider', {
  networks: 'Networks',
  empty: 'No Networks Selected',
});

export { tvNetworks };

export { defaultDiscoverNetworks };

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
