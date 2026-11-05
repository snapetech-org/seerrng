import type { EditionCard } from '@server/lib/editionCompare';

const languageCode = (value: string) => {
  const normalized = value.trim().toLowerCase().split(/[-_]/)[0];
  return (
    (
      {
        eng: 'en',
        english: 'en',
        fra: 'fr',
        fre: 'fr',
        deu: 'de',
        ger: 'de',
        spa: 'es',
      } as Record<string, string>
    )[normalized] ?? normalized
  );
};

/** A transparent local recommendation: a missing, unabridged recording in the UI language. */
export const recommendedNarration = (
  recordings: EditionCard[],
  locale: string
): EditionCard | undefined =>
  recordings.find(
    (recording) =>
      !recording.owned &&
      recording.requestable !== false &&
      recording.abridged === 'unabridged' &&
      recording.narrators.length > 0 &&
      !!recording.language &&
      languageCode(recording.language) === languageCode(locale)
  );

export const initialNarration = (
  recordings: EditionCard[],
  locale: string
): EditionCard | undefined =>
  recommendedNarration(recordings, locale) ??
  recordings.find((item) => !item.owned && item.requestable !== false) ??
  recordings[0];
