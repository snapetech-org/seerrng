import ImageFader from '@app/components/Common/ImageFader';
import useSWR from 'swr';

interface AuthBackdropItem {
  path: string;
}

const AuthBackdrop = () => {
  const { data } = useSWR<AuthBackdropItem[]>('/api/v1/backdrops', {
    refreshInterval: 0,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
  });

  return (
    <ImageFader
      backgroundImages={
        data?.map(
          (backdrop) => `https://image.tmdb.org/t/p/w1280${backdrop.path}`
        ) ?? []
      }
    />
  );
};

export default AuthBackdrop;
