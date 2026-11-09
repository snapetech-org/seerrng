import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Requests.BookOrbitActions', {
  open: 'Open {format} request in BookOrbit',
  hint: 'Review or manage this request in BookOrbit. SeerrNG will keep tracking its progress.',
  ebook: 'book',
  audiobook: 'audiobook',
});

const BookOrbitRequestActions = ({
  links,
}: {
  links?: { format: 'ebook' | 'audiobook'; url: string }[];
}) => {
  const intl = useIntl();
  return (
    <>
      {links?.map((linked) => {
        const href = getSafeHref(linked.url);
        if (!href || !/^https?:\/\//i.test(href)) return null;
        const label = intl.formatMessage(messages.open, {
          format: intl.formatMessage(
            linked.format === 'audiobook' ? messages.audiobook : messages.ebook
          ),
        });
        return (
          <Tooltip
            key={`${linked.format}-${href}`}
            content={intl.formatMessage(messages.hint)}
          >
            <Button
              as="a"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              buttonType="externalService"
              buttonSize="sm"
              aria-label={label}
            >
              <ArrowTopRightOnSquareIcon
                className="app-action-icon"
                aria-hidden="true"
              />
              {label}
            </Button>
          </Tooltip>
        );
      })}
    </>
  );
};

export default BookOrbitRequestActions;
