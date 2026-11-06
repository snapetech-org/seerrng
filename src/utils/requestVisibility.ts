export const shouldHideRequestedMedia = (
  hideRequested: boolean,
  mediaType: string | null | undefined,
  hasActiveRequest: boolean | null | undefined
): boolean =>
  hideRequested &&
  (mediaType === 'movie' || mediaType === 'tv') &&
  hasActiveRequest === true;
