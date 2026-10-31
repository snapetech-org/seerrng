import Button from '@app/components/Common/Button';
import MediaTypeBadge from '@app/components/Common/MediaTypeBadge';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { CheckIcon, TrashIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useIntl } from 'react-intl';
import { mutate } from 'swr';

interface ErrorCardProps {
  id: number;
  tmdbId: number;
  tvdbId?: number;
  type: 'movie' | 'tv';
  canExpand?: boolean;
}

const messages = defineMessages('components.TitleCard', {
  mediaerror: '{mediaType} Not Found',
  tmdbid: 'TMDB ID',
  tvdbid: 'TheTVDB ID',
  cleardata: 'Clear Data',
});

const ErrorCard = ({ id, tmdbId, tvdbId, type }: ErrorCardProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();

  const deleteMedia = async () => {
    try {
      await axios.delete(`/api/v1/watchlist/${tmdbId}?mediaType=${type}`);
    } catch (e) {
      if (!axios.isAxiosError(e) || e.response?.status !== 404) {
        addToast(intl.formatMessage(globalMessages.error), {
          appearance: 'error',
          autoDismiss: true,
        });
        return;
      }
    }
    await axios.delete(`/api/v1/media/${id}`).catch((e) => {
      if (axios.isAxiosError(e) && e.response?.status === 404) return;
      addToast(intl.formatMessage(globalMessages.error), {
        appearance: 'error',
        autoDismiss: true,
      });
    });
    mutate('/api/v1/discover/watchlist');
    mutate('/api/v1/media?filter=allavailable&take=20&sort=mediaAdded');
    mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
  };

  return (
    <div
      className="poster-layout title-card-shell"
      data-media-type={type}
      data-testid="title-card"
    >
      <div className="app-card-poster" data-poster-region="frame">
        <div
          data-poster-region="content"
          data-poster-detail="full"
          data-poster-has-action="true"
        >
          <div data-poster-region="controls">
            <div data-poster-region="control-row">
              <div data-poster-region="type-slot">
                <MediaTypeBadge mediaType={type} variant="card" />
              </div>
              <div data-poster-region="status-slot">
                <span className="poster-control poster-control-available">
                  <CheckIcon />
                </span>
              </div>
            </div>
          </div>

          <div data-poster-region="copy-anchor">
            <div data-poster-region="copy">
              <h1
                className="card-title"
                data-title-weight="regular"
                data-poster-region="title"
                data-testid="title-card-title"
              >
                {intl.formatMessage(messages.mediaerror, {
                  mediaType: intl.formatMessage(
                    type === 'movie'
                      ? globalMessages.movie
                      : globalMessages.tvshow
                  ),
                })}
              </h1>
              <div className="line-clamp-3 text-xs break-words whitespace-normal">
                <div className="flex items-center">
                  <span className="me-2 font-bold text-gray-400">
                    {intl.formatMessage(messages.tmdbid)}
                  </span>
                  {tmdbId}
                </div>
                {!!tvdbId && (
                  <div className="mt-2 flex items-center sm:mt-1">
                    <span className="me-2 font-bold text-gray-400">
                      {intl.formatMessage(messages.tvdbid)}
                    </span>
                    {tvdbId}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div data-poster-region="actions">
            <Button
              buttonType="danger"
              buttonSize="sm"
              onClick={(e) => {
                e.preventDefault();
                deleteMedia();
              }}
            >
              <TrashIcon />
              <span>{intl.formatMessage(messages.cleardata)}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ErrorCard;
