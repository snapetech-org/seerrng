import type { ReactNode } from 'react';

/** Render untrusted API/provider text verbatim without inheriting the UI language. */
export default function OpaqueApiMessageText({
  children,
}: {
  children: ReactNode;
}) {
  if (typeof children !== 'string') return <>{children}</>;
  return (
    <bdi dir="auto" lang="und">
      {children}
    </bdi>
  );
}
