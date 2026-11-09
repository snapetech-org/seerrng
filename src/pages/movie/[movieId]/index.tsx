import MovieDetails from '@app/components/MovieDetails';
import {
  encodeInternalApiPathSegment,
  getInternalApiBaseUrl,
  INTERNAL_API_HTTP_OPTIONS,
} from '@app/utils/internalApi';
import type { MovieDetails as MovieDetailsType } from '@server/models/Movie';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface MoviePageProps {
  movie?: MovieDetailsType;
}

const MoviePage: NextPage<MoviePageProps> = ({ movie }) => {
  return <MovieDetails movie={movie} />;
};

export const getServerSideProps: GetServerSideProps<MoviePageProps> = async (
  ctx
) => {
  const response = await axios
    .get<MovieDetailsType>(
      `${getInternalApiBaseUrl()}/api/v1/movie/${encodeInternalApiPathSegment(
        ctx.query.movieId
      )}`,
      {
        ...INTERNAL_API_HTTP_OPTIONS,
        headers: ctx.req?.headers?.cookie
          ? { cookie: ctx.req.headers.cookie }
          : undefined,
      }
    )
    .catch(() => undefined);

  // Hydration metadata is optional. The authenticated client owns recovery;
  // never bubble an Axios error containing request cookies into Next's 500.
  return { props: response ? { movie: response.data } : {} };
};

export default MoviePage;
