export const getLocaleDirection = (locale: string): 'ltr' | 'rtl' =>
  locale.toLowerCase().split(/[-_]/, 1)[0] === 'ar' ? 'rtl' : 'ltr';
