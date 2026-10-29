import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  redirect: {
    destination: {
      pathname: '/search',
      query: {
        scope: 'releases',
        ...(typeof query.query === 'string' ? { query: query.query } : {}),
        ...(typeof query.category === 'string'
          ? { category: query.category }
          : {}),
      },
    },
    permanent: false,
  },
});

export default function IndexerSearchPage() {
  return null;
}
