import Button from '@app/components/Common/Button';
import { getSafeHttpsHref } from '@app/utils/safeUrl';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import messages from './messages';

/** Fetches audio only after an explicit action; one recording plays at a time. */
export default function NarrationSample({
  url,
  active,
  onActiveChange,
}: {
  url?: string;
  active: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const intl = useIntl();
  const player = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  const safeUrl = getSafeHttpsHref(url);
  useEffect(() => {
    setFailed(false);
  }, [safeUrl]);
  useEffect(() => {
    const audio = player.current;
    if (!audio) return;
    if (!active) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    let current = true;
    void audio.play().catch(() => {
      if (current) setFailed(true);
    });
    return () => {
      current = false;
      audio.pause();
    };
  }, [active, safeUrl]);
  return (
    <div className="persius-sample">
      <Button
        disabled={!safeUrl}
        aria-pressed={active}
        onClick={() => {
          setFailed(false);
          onActiveChange(!active);
        }}
        title={
          !safeUrl ? intl.formatMessage(messages.sampleUnavailable) : undefined
        }
      >
        {active ? (
          <StopIcon aria-hidden="true" />
        ) : (
          <PlayIcon aria-hidden="true" />
        )}
        {intl.formatMessage(active ? messages.stopSample : messages.sample)}
      </Button>
      {safeUrl && (
        <audio
          ref={player}
          src={active ? safeUrl : undefined}
          preload="none"
          controls={active && !failed}
          aria-label={intl.formatMessage(messages.sample)}
          onEnded={() => onActiveChange(false)}
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <small role="status">{intl.formatMessage(messages.sampleFailed)}</small>
      )}
    </div>
  );
}
