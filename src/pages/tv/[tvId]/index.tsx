import TvDetails from '@app/components/TvDetails';
import {
  encodeInternalApiPathSegment,
  getInternalApiBaseUrl,
  INTERNAL_API_HTTP_OPTIONS,
} from '@app/utils/internalApi';
import type { TvDetails as TvDetailsType } from '@server/models/Tv';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface TvPageProps {
  tv?: TvDetailsType;
}

const TvPage: NextPage<TvPageProps> = ({ tv }) => {
  return <TvDetails tv={tv} />;
};

export const getServerSideProps: GetServerSideProps<TvPageProps> = async (
  ctx
) => {
  const response = await axios
    .get<TvDetailsType>(
      `${getInternalApiBaseUrl()}/api/v1/tv/${encodeInternalApiPathSegment(
        ctx.query.tvId
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
  return { props: response ? { tv: response.data } : {} };
};

export default TvPage;
