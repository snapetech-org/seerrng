// Publisher names (as ComicVine spells them) that tell a manga volume from a
// Western comic. ComicVine has no manga flag, so the publisher is the most
// reliable signal it offers. Names are compared after normalizeName().

const normalizeName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// English-language manga publishers and imprints. Dark Horse and Abrams also
// publish Western comics, so only their manga-specific names are listed.
const ENGLISH_MANGA_PUBLISHERS = [
  'Yen Press',
  'Yen On',
  'Viz',
  'Viz Media',
  'Viz Communications',
  'Kodansha USA',
  'Kodansha Comics',
  'Kodansha America',
  'Seven Seas',
  'Seven Seas Entertainment',
  'Steamship',
  'Ghost Ship',
  'Airship',
  'Square Enix Manga',
  'Square Enix Manga and Books',
  'Square Enix Books',
  'Vertical',
  'Vertical Comics',
  'Vertical Inc',
  'Tokyopop',
  'J-Novel Club',
  'Denpa',
  'Denpa Books',
  'One Peace Books',
  'SuBLime',
  'Sublime Manga',
  'Udon Entertainment',
  'Digital Manga Publishing',
  'Digital Manga',
  'Del Rey Manga',
  'Kaiten Books',
  'Titan Manga',
  'Dark Horse Manga',
  'Abrams ComicArts Kana',
  'Kana Abrams',
  'Ize Press',
  'Inklore',
  'CMX',
  'CMX Manga',
  'Go Comi',
  'Fakku',
  'Media Blasters',
  'ADV Manga',
  'Broccoli Books',
  'Netcomics',
  'Tokyopop Manga',
  'Vertical Kodansha',
].map(normalizeName);

// Japanese publishers: their ComicVine volumes are the original editions.
// They are still manga (so they file into the manga library), but they are
// never offered as the English edition.
const JAPANESE_MANGA_PUBLISHERS = [
  'Shueisha',
  'Shogakukan',
  'Kodansha',
  'Square Enix',
  'Hakusensha',
  'Kadokawa',
  'Kadokawa Shoten',
  'Enterbrain',
  'Akita Shoten',
  'Futabasha',
  'Mag Garden',
  'Ichijinsha',
  'Shonen Gahosha',
  'Tokuma Shoten',
  'Houbunsha',
  'Hobunsha',
  'Coamix',
  'Gentosha',
  'Shinchosha',
  'Takeshobo',
  'Fujimi Shobo',
  'Media Factory',
  'ASCII Media Works',
  'Libre',
  'Leed',
  'Nihon Bungeisha',
  'Kobunsha',
  'Overlap',
  'Earth Star Entertainment',
  'Micro Magazine',
  'Hifumi Shobo',
  'Frontier Works',
  'Wani Books',
  'Ohzora Shuppan',
  'Akane Shinsha',
  'Jitsugyo no Nihon Sha',
  'Nihon Mangasha',
].map(normalizeName);

const ENGLISH = new Set(ENGLISH_MANGA_PUBLISHERS);
const JAPANESE = new Set(JAPANESE_MANGA_PUBLISHERS);

/** An English-language manga publisher (the edition worth requesting). */
export const isEnglishMangaPublisher = (name?: string | null): boolean => {
  if (!name) return false;
  const n = normalizeName(name);
  return ENGLISH.has(n);
};

/** A Japanese manga publisher (original-language edition). */
export const isJapaneseMangaPublisher = (name?: string | null): boolean => {
  if (!name) return false;
  return JAPANESE.has(normalizeName(name));
};

/**
 * Whether a ComicVine volume from this publisher is manga, in any language
 * this list knows. A publisher name that says "manga" counts too.
 */
export const isMangaPublisher = (name?: string | null): boolean => {
  if (!name) return false;
  const n = normalizeName(name);
  return ENGLISH.has(n) || JAPANESE.has(n) || /\bmanga\b/.test(n);
};

/** Manga-ness and edition language of a ComicVine volume's publisher. */
export const mangaEditionOf = (
  name?: string | null
): { manga: boolean; edition?: 'en' | 'ja' } =>
  isEnglishMangaPublisher(name)
    ? { manga: true, edition: 'en' }
    : isJapaneseMangaPublisher(name)
      ? { manga: true, edition: 'ja' }
      : { manga: isMangaPublisher(name) };
