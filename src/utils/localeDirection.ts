export const getLocaleDirection = (locale: string): 'ltr' | 'rtl' => {
  const language = locale.toLowerCase().split(/[-_]/, 1)[0];

  return language === 'ar' || language === 'he' ? 'rtl' : 'ltr';
};
