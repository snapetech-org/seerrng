import globalMessages from '@app/i18n/globalMessages';
import { BellIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const Notifications = () => {
  const intl = useIntl();
  return (
    <button
      className="rounded-full p-1 text-gray-400 hover:bg-gray-500 hover:text-white focus:text-white focus:ring focus:outline-none"
      aria-label={intl.formatMessage(globalMessages.notifications)}
    >
      <BellIcon className="h-6 w-6" />
    </button>
  );
};

export default Notifications;
