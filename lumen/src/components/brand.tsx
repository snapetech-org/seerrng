import { Icon } from '../icons';
import { site } from '../mediaServer';

// the logo + name in the sidebar and on the sign-in page (admins can swap both)
export function BrandMark() {
  const s = site();
  return (
    <>
      {s.logo ? (
        <img className="mark mark-img" src={s.logo} alt="" />
      ) : (
        <span className="mark">
          <Icon name="play" size="sm" />
        </span>
      )}
      {s.name}
    </>
  );
}
export const brandName = () => site().name || 'SeerrNG';
