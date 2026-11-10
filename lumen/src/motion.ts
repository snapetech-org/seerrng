// smooth scrolling unless the person asked their device for less motion
export const scrollBehavior = (): ScrollBehavior =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
