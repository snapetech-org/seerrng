import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import {
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import { MAX_ISSUE_MESSAGE_LENGTH } from '@server/constants/issue';
import type { default as IssueCommentType } from '@server/entity/IssueComment';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { FormattedDate, useIntl } from 'react-intl';
import ReactMarkdown from 'react-markdown';
import * as Yup from 'yup';

const messages = defineMessages('components.IssueDetails.IssueComment', {
  delete: 'Delete',
  deleteTitle: 'Delete Comment',
  areyousuredelete: 'Are you sure you want to delete this comment?',
  validationComment: 'You must enter a message',
  validationCommentLength:
    'Comment must be {maxLength, number} characters or fewer',
  edit: 'Edit',
  edited: 'Edited',
  editHelp: 'Edit your comment on this issue.',
  deleteHelp: 'Permanently delete this comment after confirmation.',
  cancelHelp: 'Discard these edits and keep the saved comment.',
  saveHelp: 'Save changes to this comment.',
});

interface IssueCommentProps {
  comment: IssueCommentType;
  isActiveUser?: boolean;
  onUpdate?: () => void;
}

const IssueComment = ({
  comment,
  isActiveUser = false,
  onUpdate,
}: IssueCommentProps) => {
  const intl = useIntl();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { hasPermission } = useUser();
  const canDelete = isActiveUser || hasPermission(Permission.MANAGE_ISSUES);
  const edited =
    new Date(comment.createdAt).getTime() !==
    new Date(comment.updatedAt).getTime();
  const schema = Yup.object().shape({
    newMessage: Yup.string()
      .max(
        MAX_ISSUE_MESSAGE_LENGTH,
        intl.formatMessage(messages.validationCommentLength, {
          maxLength: MAX_ISSUE_MESSAGE_LENGTH,
        })
      )
      .required(intl.formatMessage(messages.validationComment)),
  });

  const deleteComment = async () => {
    try {
      await axios.delete(`/api/v1/issueComment/${comment.id}`);
    } finally {
      setShowDeleteModal(false);
      onUpdate?.();
    }
  };

  return (
    <div className="grid grid-cols-[max-content_2rem_minmax(0,1fr)] items-start gap-x-3 border-t border-gray-700/70 py-2 first:border-t-0">
      <Transition
        as={Fragment}

        show={showDeleteModal}
      >
        <Modal
          title={intl.formatMessage(messages.deleteTitle)}
          onCancel={() => setShowDeleteModal(false)}
          onOk={() => void deleteComment()}
          okText={intl.formatMessage(messages.delete)}
          okButtonType="danger"
          okButtonProps={{ buttonIcon: 'delete' }}
        >
          {intl.formatMessage(messages.areyousuredelete)}
        </Modal>
      </Transition>

      <time
        className="refreshed-detail-text-muted text-xs leading-4 whitespace-nowrap"
        dateTime={new Date(comment.createdAt).toISOString()}
      >
        <FormattedDate value={comment.createdAt} dateStyle="medium" />
        <span aria-hidden="true"> </span>
        <FormattedDate value={comment.createdAt} timeStyle="short" />
      </time>
      <Link href={isActiveUser ? '/profile' : `/users/${comment.user.id}`}>
        <CachedImage
          type="avatar"
          src={comment.user.avatar}
          alt=""
          className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-500 transition hover:ring-indigo-400"
          width={32}
          height={32}
        />
      </Link>

      <div className="refreshed-detail-text min-w-0 text-xs leading-4">
        {!isEditing && (isActiveUser || canDelete) && (
          <div className="issue-comment-actions">
            {isActiveUser && (
              <Button
                type="button"
                onClick={() => setIsEditing(true)}
                buttonType="manage"
                buttonSize="sm"
                title={intl.formatMessage(messages.editHelp)}
              >
                <PencilSquareIcon />
                {intl.formatMessage(messages.edit)}
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                buttonType="danger"
                buttonSize="sm"
                title={intl.formatMessage(messages.deleteHelp)}
              >
                <TrashIcon />
                {intl.formatMessage(messages.delete)}
              </Button>
            )}
          </div>
        )}
        <div className="leading-4">
          <Link
            href={isActiveUser ? '/profile' : `/users/${comment.user.id}`}
            className="font-medium text-gray-200 hover:text-white hover:underline"
          >
            {comment.user.displayName}
          </Link>
          {edited && (
            <span className="refreshed-detail-text-muted ms-1">
              ({intl.formatMessage(messages.edited)})
            </span>
          )}
        </div>
        {isEditing ? (
          <Formik
            initialValues={{ newMessage: comment.message }}
            validationSchema={schema}
            onSubmit={async (values) => {
              await axios.put(`/api/v1/issueComment/${comment.id}`, {
                message: values.newMessage,
              });
              onUpdate?.();
              setIsEditing(false);
            }}
          >
            {({ isValid, isSubmitting, errors, touched }) => (
              <Form className="mt-1">
                <Field
                  as="textarea"
                  rows={3}
                  id={`comment-${comment.id}`}
                  name="newMessage"
                  className="issue-comment-input"
                />
                {errors.newMessage && touched.newMessage && (
                  <div className="mt-1 text-xs text-red-300">
                    {String(errors.newMessage)}
                  </div>
                )}
                <div className="issue-discussion-actions card-spacing-before">
                  <Button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    buttonType="success"
                    buttonSize="sm"
                    title={intl.formatMessage(messages.cancelHelp)}
                  >
                    <XMarkIcon />
                    {intl.formatMessage(globalMessages.cancel)}
                  </Button>
                  <Button
                    type="submit"
                    disabled={!isValid || isSubmitting}
                    buttonType="success"
                    buttonSize="sm"
                    title={intl.formatMessage(messages.saveHelp)}
                  >
                    <CheckIcon />
                    {intl.formatMessage(globalMessages.save)}
                  </Button>
                </div>
              </Form>
            )}
          </Formik>
        ) : (
          <div className="refreshed-detail-text-muted prose prose-sm prose-p:my-0 prose-p:leading-4 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-li:leading-4 max-w-full text-xs leading-4">
            <ReactMarkdown
              skipHtml
              allowedElements={['p', 'em', 'strong', 'ul', 'ol', 'li']}
            >
              {comment.message}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default IssueComment;
