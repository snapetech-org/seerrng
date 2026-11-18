import { readerServiceUrl } from '../api';
import { useApi } from '../hooks';

type Target = 'ebook' | 'audiobook' | 'comic' | 'magazine';
interface ReaderService {
  provider: 'grimmory' | 'bookorbit';
  serviceUrl: string | null;
  grimmoryUrl?: string | null;
}

const libraries: Record<Target, string> = {
  ebook: 'Ebooks',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazine PDFs',
};

export default function ReaderDeliveryLink({ target }: { target: Target }) {
  const { data } = useApi<ReaderService>('/service/reader-delivery');
  if (data?.provider !== 'grimmory' && data?.provider !== 'bookorbit')
    return null;
  const raw =
    data.provider === 'grimmory' &&
    (target === 'audiobook' || target === 'comic')
      ? data.grimmoryUrl || data.serviceUrl
      : data.serviceUrl;
  const url = raw ? readerServiceUrl(raw) : null;
  if (!url || url.search || url.hash) return null;
  url.pathname = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/(?:api\/v1\/opds|komga\/api)$/i, '');
  const service = data.provider === 'grimmory' ? 'Grimmory' : 'BookOrbit';
  return (
    <a
      className="btn btn-tonal btn-sm"
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Browse {libraries[target]} in {service}
    </a>
  );
}
