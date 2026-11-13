import { PageStatus } from '@app/components/Common/LoadingSpinner';

interface HeaderProps {
  subtext?: React.ReactNode;
  children: React.ReactNode;
}

const Header = ({ children, subtext }: HeaderProps) => {
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
