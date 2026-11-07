import Button from '@app/components/Common/Button';
import DetailDisclosureButton from '@app/components/MediaDetails/DetailDisclosureButton';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

const AdvancedOptionsDisclosureButton = ({
  label,
  open,
  pinned,
  onToggle,
  onPin,
  controlVariant,
  plain = false,
}: {
  label: string;
  open: boolean;
  pinned: boolean;
  onToggle: () => void;
  onPin: () => void;
  controlVariant?: 'book-request-advanced-options';
  /** The upstream video request flow uses a plain advanced-options button. */
  plain?: boolean;
}) => {
  const upstream = useUpstreamTheme();
  return upstream && plain ? (
    <Button onClick={onToggle} aria-expanded={open}>
      {label}
    </Button>
  ) : (
    <DetailDisclosureButton
      label={label}
      icon={<AdjustmentsHorizontalIcon aria-hidden="true" />}
      open={open}
      onClick={onToggle}
      controlVariant={controlVariant}
      pinned={pinned}
      onPinClick={onPin}
    />
  );
};

export default AdvancedOptionsDisclosureButton;
