import { useState } from 'react';

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

function avatarSource(avatar?: string) {
  if (!avatar) return;
  if (
    /^\/avatarproxy\/(?:local\/\d+|[a-f0-9]{32})(?:\?v=[a-f0-9]{64})?$/i.test(
      avatar
    )
  )
    return avatar;
  try {
    const url = new URL(avatar);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /(?:^|\.)(?:plex\.tv|gravatar\.com)$/i.test(url.hostname)
    )
      return `/avatarproxy/remote?${new URLSearchParams({ url: avatar })}`;
  } catch {
    // An absent or unsupported picture uses the profile initials.
  }
}

export default function AvatarContent({
  name,
  avatar,
}: {
  name?: string;
  avatar?: string;
}) {
  const source = avatarSource(avatar);
  const [failedSource, setFailedSource] = useState<string>();
  return source && source !== failedSource ? (
    <img src={source} alt="" onError={() => setFailedSource(source)} />
  ) : (
    initials(name || '?')
  );
}
