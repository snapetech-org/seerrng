const rightToLeftLanguages = new Set([
  'ar',
  'dv',
  'fa',
  'he',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

export const getLocaleDirection = (locale: string): 'ltr' | 'rtl' => {
  const language = locale.toLowerCase().split(/[-_]/, 1)[0];
  return rightToLeftLanguages.has(language) ? 'rtl' : 'ltr';
};
