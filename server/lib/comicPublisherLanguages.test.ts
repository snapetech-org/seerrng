import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isWesternEnglishPublisher,
  languageName,
  publisherLanguage,
} from '@server/lib/comicPublisherLanguages';

describe('publisherLanguage', () => {
  it('knows the Chainsaw Man publishers', () => {
    assert.deepEqual(
      [
        'Viz',
        'Shueisha',
        'Norma Editorial',
        'Crunchyroll SAS',
        'Egmont Ehapa Verlag',
        'Egmont Manga',
        'NXB Trẻ',
        'Haksan',
        'Crew',
      ].map(publisherLanguage),
      ['en', 'ja', 'es', 'fr', 'de', 'de', 'vi', 'ko', 'cs']
    );
  });

  it('knows the other common manga and comic publishers', () => {
    assert.equal(publisherLanguage('Yen Press'), 'en');
    assert.equal(publisherLanguage('Editorial Ivrea'), 'es');
    assert.equal(publisherLanguage('Éditions Glénat'), 'fr');
    assert.equal(publisherLanguage('Pika Édition'), 'fr');
    assert.equal(publisherLanguage('Panini Verlag'), 'de');
    assert.equal(publisherLanguage('Panini España'), 'es');
    assert.equal(publisherLanguage('Edizioni Star Comics'), 'it');
    assert.equal(publisherLanguage('Panini Brasil'), 'pt');
    assert.equal(publisherLanguage('Tong Li Publishing Co.'), 'zh');
    assert.equal(publisherLanguage('Kim Dong Publishing House'), 'vi');
    assert.equal(publisherLanguage('Marvel'), 'en');
    assert.equal(publisherLanguage('DC Comics'), 'en');
    assert.equal(publisherLanguage('Marvel UK/Panini UK'), 'en');
  });

  it('reads a country word in names it has not seen', () => {
    assert.equal(publisherLanguage('Panini Comics Deutschland GmbH'), 'de');
    assert.equal(publisherLanguage('Glénat Spain'), 'es');
    assert.equal(publisherLanguage('Glénat Italia'), 'it');
  });

  it('leaves unknown publishers unknown', () => {
    assert.equal(publisherLanguage('New England Comics'), undefined);
    assert.equal(publisherLanguage(undefined), undefined);
    assert.equal(publisherLanguage(''), undefined);
  });

  it('names languages and tells Western publishers apart', () => {
    assert.equal(languageName('es'), 'Spanish');
    assert.equal(languageName('xx'), 'XX');
    assert.equal(languageName(undefined), undefined);
    assert.equal(isWesternEnglishPublisher('Image'), true);
    assert.equal(isWesternEnglishPublisher('Boom! Studios'), true);
    assert.equal(isWesternEnglishPublisher('Viz'), false);
    assert.equal(isWesternEnglishPublisher('Norma Editorial'), false);
  });
});
