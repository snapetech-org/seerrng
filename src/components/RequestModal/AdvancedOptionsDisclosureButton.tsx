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
}: {
  label: string;
  open: boolean;
  pinned: boolean;
  onToggle: () => void;
  onPin: () => void;
  controlVariant?: 'book-request-advanced-options';
}) => {
  const upstream = useUpstreamTheme();
  return upstream ? (
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
