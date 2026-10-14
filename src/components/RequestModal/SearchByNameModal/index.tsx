import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.RequestModal.SearchByNameModal', {
  notvdbiddescription:
    'We were unable to automatically match this series. Please select the correct match below.',
  nomatches: 'We were unable to find a match for this series.',
  showmore: 'Show More Results',
});

interface SearchByNameModalProps {
  setTvdbId: (id: number) => void;
  tvdbId: number | undefined;
  onCancel?: () => void;
  closeModal: () => void;
  modalTitle: string;
  modalSubTitle: string;
  tmdbId: number;
  backdrop?: string;
}

const SearchByNameModal = ({
  setTvdbId,
  tvdbId,
  onCancel,
  closeModal,
  modalTitle,
  modalSubTitle,
  tmdbId,
  backdrop,
}: SearchByNameModalProps) => {
  const intl = useIntl();
  const [expandedTmdbId, setExpandedTmdbId] = useState<number | null>(null);
  const showAllResults = expandedTmdbId === tmdbId;
  const { data, error } = useSWR<SonarrSeries[]>(
    `/api/v1/service/sonarr/lookup/${tmdbId}`
  );

  const handleClick = (tvdbId: number) => {
    setTvdbId(tvdbId);
  };

  if ((data ?? []).length === 0 || error) {
    return (
      <Modal
        loading={!data && !error}
        backgroundClickable
        onOk={onCancel}
        title={modalTitle}
        subTitle={modalSubTitle}
        okText={intl.formatMessage(globalMessages.close)}
        okButtonType="primary"
        backdrop={backdrop}
      >
        <Alert title={intl.formatMessage(messages.nomatches)} type="info" />
      </Modal>
    );
  }

  return (
    <Modal
      backgroundClickable
      onCancel={onCancel}
      onOk={closeModal}
      title={modalTitle}
      subTitle={modalSubTitle}
      okText={intl.formatMessage(globalMessages.next)}
      okDisabled={!tvdbId}
      okButtonType="primary"
      backdrop={backdrop}
    >
      <Alert
        title={intl.formatMessage(messages.notvdbiddescription)}
        type="info"
      />
      <div className="grid grid-cols-1 gap-4 pb-2 md:grid-cols-2">
        {(showAllResults ? data : data?.slice(0, 6))?.map((item) => (
          <button
            key={item.tvdbId}
            className="focus:ring-opacity-70 container mx-auto flex h-40 scale-100 transform-gpu cursor-pointer flex-col items-center justify-center space-y-4 rounded-xl transition outline-none hover:scale-105 focus:ring focus:ring-indigo-500 focus:outline-none"
            onClick={() => handleClick(item.tvdbId)}
          >
            <div
              className={`flex h-40 w-full items-center overflow-hidden rounded-xl border border-gray-700 bg-gray-700/20 p-2 shadow backdrop-blur transition ${
                tvdbId === item.tvdbId ? 'ring ring-indigo-500' : ''
              } `}
            >
              <div className="relative flex w-24 flex-none items-center space-x-4 self-stretch">
                <CachedImage
                  type="tvdb"
                  src={
                    item.remotePoster ?? '/images/seerr_poster_not_found.png'
                  }
                  alt={item.title}
                  className="h-auto w-100 rounded-md"
                  fill
                />
              </div>
              <div className="flex-grow self-start p-3 text-left">
                <div className="text-sm leading-tight font-medium">
                  {item.year}
                </div>
                <div
                  className="text-grey-200 text-xl leading-tight font-bold"
                  style={{
                    WebkitLineClamp: 1,
                    display: '-webkit-box',
                    overflow: 'hidden',
                    WebkitBoxOrient: 'vertical',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.title}
                </div>
                {item.overview && (
                  <div
                    className="text-xs whitespace-normal text-gray-400"
                    style={{
                      WebkitLineClamp: 5,
                      display: '-webkit-box',
                      overflow: 'hidden',
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.overview}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
      {!showAllResults && (data?.length ?? 0) > 6 && (
        <Button
          type="button"
          buttonType="ghost"
          onClick={() => setExpandedTmdbId(tmdbId)}
        >
          {intl.formatMessage(messages.showmore)}
        </Button>
      )}
    </Modal>
  );
};

export default SearchByNameModal;
