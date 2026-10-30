import ComingSoon from '@app/components/Persius/ComingSoon';
import usePersius from '@app/components/Persius/usePersius';
import CalendarPage from './calendar';

export default function ComingSoonPage() {
  return usePersius() ? <ComingSoon /> : <CalendarPage />;
}
