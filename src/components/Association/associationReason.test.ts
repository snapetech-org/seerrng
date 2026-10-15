import frenchMessages from '@app/i18n/locale/fr.json';
import { createIntl, createIntlCache } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { formatAssociationReason } from './associationReason';

const intl = createIntl(
  { locale: 'fr', messages: frenchMessages },
  createIntlCache()
);

describe('formatAssociationReason', () => {
  it('formats app-owned reason templates with the active locale and values', () => {
    expect(
      formatAssociationReason(intl, {
        reason: 'Shares Animation',
        reasonKey: 'sharesGenre',
        reasonValues: { genre: 'Animation' },
      })
    ).toBe('Partage le genre Animation');
  });

  it('keeps the server-provided reason as a fallback for older responses', () => {
    expect(
      formatAssociationReason(intl, {
        reason: 'Legacy association reason',
      })
    ).toBe('Legacy association reason');
  });
});
