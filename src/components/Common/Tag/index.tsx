import { TagIcon } from '@heroicons/react/24/outline';
import React, { memo, useMemo, type JSX } from 'react';

type TagProps = {
  children: React.ReactNode;
  iconSvg?: JSX.Element;
};

const Tag = memo(({ children, iconSvg }: TagProps) => {
  const icon = useMemo(
    () =>
      iconSvg ? (
        React.cloneElement(iconSvg, {
          className: 'me-1 h-4 w-4',
        })
      ) : (
        <TagIcon className="me-1 h-4 w-4" />
      ),
    [iconSvg]
  );

  return (
    <div className="inline-flex cursor-pointer items-center rounded-full bg-gray-800/35 px-2 py-1 text-sm leading-snug text-gray-200 ring-1 ring-gray-600 transition ring-inset hover:bg-gray-700/55 active:bg-gray-700/70">
      {icon}
      <span>{children}</span>
    </div>
  );
});

Tag.displayName = 'Tag';

export default Tag;
