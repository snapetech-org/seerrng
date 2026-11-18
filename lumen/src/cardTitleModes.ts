import {
  api,
  defaultCardTitleModes,
  type CardTitleSettings,
  type User,
} from './api';

export function cardTitleModes(settings: User['settings']) {
  return {
    movie: settings?.cardTextVisibilityMovie ?? defaultCardTitleModes.movie,
    tv: settings?.cardTextVisibilityTv ?? defaultCardTitleModes.tv,
    album: settings?.cardTextVisibilityAlbum ?? defaultCardTitleModes.album,
    book: settings?.cardTextVisibilityBook ?? defaultCardTitleModes.book,
  };
}

export function saveCardTitleModes(path: string, changes: CardTitleSettings) {
  return api<CardTitleSettings>(path, {
    method: 'POST',
    body: JSON.stringify(changes),
  });
}
