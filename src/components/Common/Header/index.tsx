import { PageStatus } from '@app/components/Common/LoadingSpinner';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';

interface HeaderProps {
  subtext?: React.ReactNode;
  children: React.ReactNode;
}

const Header = ({ children, subtext }: HeaderProps) => {
  const upstream = useUpstreamTheme();

  if (upstream) {
    return (
      <>
        <div className="page-title-row">
          <h2 className="page-title" data-testid="page-header">
            <span className="text-overseerr">{children}</span>
          </h2>
          <PageStatus />
        </div>
        {subtext && <div className="page-title-subtext">{subtext}</div>}
      </>
    );
  }

  return (
    <>
      <div className="page-title-row">
        <h2 className="page-title" data-testid="page-header">
          {children}
        </h2>
        <PageStatus />
      </div>
      {subtext && <div className="page-title-subtext">{subtext}</div>}
    </>
  );
};

export default Header;
