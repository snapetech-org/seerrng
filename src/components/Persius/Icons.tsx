import type { ReactElement, SVGProps } from 'react';

const paths: Record<string, ReactElement> = {
  'discover-home': <path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z" />,
  movies: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
    </>
  ),
  series: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="m7 3 5 5 5-5" />
    </>
  ),
  books: (
    <>
      <path d="M4 3h16v18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M3 18h17" />
    </>
  ),
  audiobooks: (
    <>
      <path d="M3 15v-3a9 9 0 0 1 18 0v3" />
      <rect x="3" y="13" width="4" height="8" rx="2" />
      <rect x="17" y="13" width="4" height="8" rx="2" />
    </>
  ),
  requests: (
    <>
      <path d="m3 11 3-7h12l3 7v9H3Z" />
      <path d="M3 12h5l1 4h6l1-4h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 2v6M17 2v6M3 11h18" />
    </>
  ),
};

/** Outline set measured against the Persius reference navigation. */
export function PersiusNavigationIcon({
  name,
  fallback,
  ...props
}: SVGProps<SVGSVGElement> & { name: string; fallback?: ReactElement }) {
  if (!paths[name]) return fallback ?? null;
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export const HeadphonesIcon = (props: SVGProps<SVGSVGElement>) => (
  <PersiusNavigationIcon {...props} name="audiobooks" />
);
export const ClosedBookIcon = (props: SVGProps<SVGSVGElement>) => (
  <PersiusNavigationIcon {...props} name="books" />
);
