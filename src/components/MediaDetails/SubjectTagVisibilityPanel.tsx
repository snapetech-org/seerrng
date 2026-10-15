import Button from '@app/components/Common/Button';
import useSubjectTagVisibility from '@app/hooks/useSubjectTagVisibility';
import defineMessages from '@app/utils/defineMessages';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.MediaDetails.SubjectTagVisibilityPanel',
  {
    visibility: 'Subject tag visibility',
    show: 'Show subject tags',
    hide: 'Hide subject tags',
  }
);

interface SubjectTagVisibilityPanelProps {
  contentId: string;
  hasTags: boolean;
  title: string;
  children: ReactNode;
}

const SubjectTagVisibilityPanel = ({
  contentId,
  hasTags,
  title,
  children,
}: SubjectTagVisibilityPanelProps) => {
  const intl = useIntl();
  const { ready, visible, toggleVisibility } = useSubjectTagVisibility();
  const actionLabel = intl.formatMessage(
    visible ? messages.hide : messages.show
  );

  return (
    <>
      <div className="subject-tag-heading-row card-spacing-after">
        <h2 className="media-inset-heading">{title}</h2>
        {hasTags && (
          <Button
            type="button"
            buttonType="ghost"
            buttonSize="sm"
            iconOnly
            aria-label={intl.formatMessage(messages.visibility)}
            aria-pressed={visible}
            aria-controls={contentId}
            disabled={!ready}
            title={actionLabel}
            onClick={toggleVisibility}
          >
            {visible ? (
              <EyeIcon aria-hidden="true" />
            ) : (
              <EyeSlashIcon aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      {hasTags ? (
        <div id={contentId} hidden={!ready || !visible}>
          {children}
        </div>
      ) : (
        children
      )}
    </>
  );
};

export default SubjectTagVisibilityPanel;
