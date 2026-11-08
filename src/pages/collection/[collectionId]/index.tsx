import CollectionDetails from '@app/components/CollectionDetails';
import {
  encodeInternalApiPathSegment,
  getInternalApiBaseUrl,
  INTERNAL_API_HTTP_OPTIONS,
} from '@app/utils/internalApi';
import type { Collection } from '@server/models/Collection';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface CollectionPageProps {
  collection?: Collection;
}

const CollectionPage: NextPage<CollectionPageProps> = ({ collection }) => {
  return <CollectionDetails collection={collection} />;
};

export const getServerSideProps: GetServerSideProps<
  CollectionPageProps
> = async (ctx) => {
  const response = await axios
    .get<Collection>(
      `${getInternalApiBaseUrl()}/api/v1/collection/${encodeInternalApiPathSegment(
        ctx.query.collectionId
      )}`,
      {
        ...INTERNAL_API_HTTP_OPTIONS,
        headers: ctx.req?.headers?.cookie
          ? { cookie: ctx.req.headers.cookie }
          : undefined,
      }
    )
    .catch(() => undefined);

  // The client owner exposes load failures and Retry. Never bubble an Axios
  // error containing internal request headers into Next's rendered 500/logs.
  return { props: response ? { collection: response.data } : {} };
};

export default CollectionPage;
