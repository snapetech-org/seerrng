import globalMessages from '@app/i18n/globalMessages';
import { BookOpenIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';
import { forwardRef, type HTMLAttributes } from 'react';
import { useIntl } from 'react-intl';

export type BookFormat = 'book' | 'ebook' | 'audiobook' | 'both';
export type RequestedBookFormat = Exclude<BookFormat, 'book'>;

export const getRequestedBookFormat = (
  format?: string | null
): RequestedBookFormat => {
  if (format === 'audiobook') {
    return 'audiobook';
  }

  if (format === 'both') {
    return 'both';
  }

  return 'ebook';
};

export const getBookFormatMessage = (format?: BookFormat | null) => {
  switch (format) {
    case 'ebook':
      return globalMessages.ebook;
    case 'audiobook':
      return globalMessages.audiobook;
    case 'both':
      return globalMessages.ebookAndAudiobook;
    default:
      return globalMessages.book;
  }
};

interface BookFormatBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  format?: BookFormat | null;
  variant?: 'card' | 'compact' | 'inline' | 'selector';
  className?: string;
  showIcon?: boolean;
}

const BookFormatBadge = forwardRef<HTMLSpanElement, BookFormatBadgeProps>(
  (
    { format, variant = 'compact', className, showIcon = true, ...props },
    ref
  ) => {
    const intl = useIntl();
    const normalizedFormat = format ?? 'book';
    const label = intl.formatMessage(getBookFormatMessage(normalizedFormat));
    const isAudio = normalizedFormat === 'audiobook';
    const isBoth = normalizedFormat === 'both';
    const Icon = isAudio ? SpeakerWaveIcon : BookOpenIcon;

    const variantClasses = {
      card: 'poster-control poster-control-book-format media-type-badge-width',
      compact: 'app-filter-button compact-select-warning',
      inline: 'app-filter-button compact-select-warning',
      selector: 'discover-filter-control compact-select-warning',
    } as const;

    const badgeClassName = [variantClasses[variant], className]
      .filter(Boolean)
      .join(' ');

    return (
      <span {...props} ref={ref} className={badgeClassName} title={label}>
        {showIcon &&
          (isBoth ? (
            <span className="media-type-badge-icons" aria-hidden="true">
              <BookOpenIcon className="media-type-badge-icon" />
              <SpeakerWaveIcon className="media-type-badge-icon" />
            </span>
          ) : (
            <Icon className="media-type-badge-icon" aria-hidden="true" />
          ))}
        <span className="media-type-badge-label">{label}</span>
      </span>
    );
  }
);

BookFormatBadge.displayName = 'BookFormatBadge';

export default BookFormatBadge;
