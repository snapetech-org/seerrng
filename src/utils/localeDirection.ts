// The shared shell still contains physical left/right layout rules. Keep the
// document flow LTR until that layout is converted and reviewed for RTL.
export const getLocaleDirection = (_locale: string): 'ltr' => 'ltr';
