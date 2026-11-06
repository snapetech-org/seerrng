import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type BidiTextProps = Omit<
  ComponentPropsWithoutRef<'bdi'>,
  'children' | 'dir'
> & {
  children: ReactNode;
};

const BidiText = ({ children, ...props }: BidiTextProps) => (
  <bdi {...props} dir="auto">
    {children}
  </bdi>
);

export default BidiText;
