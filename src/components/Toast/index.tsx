import ApiMessageText from '@app/components/Common/ApiMessageText';
import globalMessages from '@app/i18n/globalMessages';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { useIntl } from 'react-intl';

export interface ToastProps {
  appearance?: 'success' | 'error' | 'info' | 'warning';
  children: React.ReactNode;
  onDismiss: () => void;
  transitionState: 'entering' | 'entered' | 'exiting' | 'exited';
}

const Toast = ({
  appearance,
  children,
  onDismiss,
  transitionState,
}: ToastProps) => {
  const intl = useIntl();
  const isExiting =
    transitionState === 'exiting' || transitionState === 'exited';

  return (
    <div
      className="toast pointer-events-none flex max-w-full items-end justify-center px-2 py-2 sm:items-start sm:justify-end"
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{ pointerEvents: 'none' }}
        className={`pointer-events-none w-full max-w-sm transform-gpu rounded-lg bg-gray-800 shadow-lg ring-1 ring-gray-500 transition duration-150 ${
          isExiting ? 'scale-90 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div className="ring-opacity-5 overflow-hidden rounded-lg ring-1 ring-black">
          <div className="p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {appearance === 'success' && (
                  <CheckCircleIcon className="h-6 w-6 text-green-400" />
                )}
                {appearance === 'error' && (
                  <ExclamationCircleIcon className="h-6 w-6 text-red-500" />
                )}
                {appearance === 'info' && (
                  <InformationCircleIcon className="h-6 w-6 text-indigo-500" />
                )}
                {appearance === 'warning' && (
                  <ExclamationTriangleIcon className="h-6 w-6 text-orange-400" />
                )}
              </div>
              <div
                className="ms-3 w-0 flex-1 text-white"
                style={{ pointerEvents: 'none' }}
              >
                {<ApiMessageText>{children}</ApiMessageText>}
              </div>
              <div className="ms-4 flex flex-shrink-0">
                <button
                  onClick={() => onDismiss()}
                  aria-label={intl.formatMessage(
                    globalMessages.dismissNotification
                  )}
                  className="pointer-events-auto inline-flex text-gray-400 transition duration-150 ease-in-out focus:text-gray-500 focus:outline-none"
                  style={{ pointerEvents: 'auto' }}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;
