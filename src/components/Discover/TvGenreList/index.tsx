import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { genreColorMap } from '@app/components/Discover/constants';
import GenreCard from '@app/components/GenreCard';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { GenreSliderItem } from '@server/interfaces/api/discoverInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.TvGenreList', {
  seriesgenres: 'Series Genres',
});

const TvGenreList = () => {
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const { data, error } = useSWR<GenreSliderItem[]>(
    `/api/v1/discover/genreslider/tv`
  );

  const title = intl.formatMessage(messages.seriesgenres);

  if (!data && !error) {
    if (upstream) return <LoadingSpinner />;

    return (
      <>
        <PageTitle title={title} />
        <Header>{title}</Header>
        <LoadingSpinner />
      </>
    );
  }

  if (!data) {
    if (upstream) return <ErrorPage statusCode={404} />;

    return (
      <>
        <PageTitle title={title} />
        <Header>{title}</Header>
        <ErrorPage statusCode={404} />
      </>
    );
  }

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.seriesgenres)} />
      <div className={upstream ? 'mb-5 mt-1' : undefined}>
        <Header>{intl.formatMessage(messages.seriesgenres)}</Header>
      </div>
      <ul className="cards-horizontal">
        {data.map((genre, index) => (
          <li key={`genre-${genre.id}-${index}`}>
            <GenreCard
              name={genre.name}
              image={`https://image.tmdb.org/t/p/w${
                upstream ? 1280 : 780
              }_filter(duotone,${
                genreColorMap[genre.id] ?? genreColorMap[0]
              })${genre.backdrops[4]}`}
              url={
                upstream
                  ? `/discover/tv/genre/${genre.id}`
                  : `/discover/tv?genre=${genre.id}`
              }
              canExpand
            />
          </li>
        ))}
      </ul>
    </>
  );
};

export default TvGenreList;
