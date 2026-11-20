import CompanyCard from '@app/components/CompanyCard';
import Slider from '@app/components/Slider';
import defineMessages from '@app/utils/defineMessages';
import {
  defaultDiscoverStudios,
  studios,
  type Studio,
} from '@lumen/discoverStudios';
import { readDiscoverStudioList } from '@server/lib/discoverStudios';
import { useIntl } from 'react-intl';

export { defaultDiscoverStudios, studios };
export type { Studio };

const messages = defineMessages('components.Discover.StudioSlider', {
  studios: 'Studios',
  empty: 'No Studios Selected',
});

const StudioSlider = ({ data }: { data?: string }) => {
  const intl = useIntl();
  const { studios: selectedStudios } = readDiscoverStudioList(
    data,
    defaultDiscoverStudios
  );
  return (
    <div>
      <Slider
        heading={
          <>
            <div className="page-heading">
              <span>{intl.formatMessage(messages.studios)}</span>
            </div>
          </>
        }
        compact
        sliderKey="studios"
        isLoading={false}
        isEmpty={selectedStudios.length === 0}
        items={selectedStudios.map((studio) => (
          <CompanyCard
            key={`studio-${studio.id}`}
            name={studio.name}
            image={
              studio.logoPath.startsWith('/images/')
                ? studio.logoPath
                : `https://image.tmdb.org/t/p/original${studio.logoPath}`
            }
            url={`/discover/movies/studio/${studio.id}`}
            logoTone={studio.logoTone}
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

export default StudioSlider;
