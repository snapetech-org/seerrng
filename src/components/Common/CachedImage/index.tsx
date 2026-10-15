import useImageVariants from '@app/hooks/useImageVariants';
import useSettings from '@app/hooks/useSettings';
import type { CacheableImageType } from '@app/utils/imageCache';
import {
  AVATAR_FALLBACK_IMAGE,
  getImageCacheUrl,
  getImageErrorFallback,
  getInitialImageUrl,
} from '@app/utils/imageCache';
import type { ImageVariant } from '@app/utils/loadedImages';
import { UserIcon } from '@heroicons/react/24/solid';
import type { ImageLoader, ImageProps } from 'next/image';
import Image from 'next/image';
import { memo, useEffect, useMemo, useState, type SyntheticEvent } from 'react';

const AVATAR_PRELOAD_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

const imageLoader: ImageLoader = ({ src }) => src;

export type CachedImageProps = ImageProps & {
  src: string;
  fallbackSrc?: string;
  errorFallbackSrc?: string;
  type: CacheableImageType;
  variants?: readonly ImageVariant[];
};

/**
 * The CachedImage component should be used wherever
 * we want to offer the option to locally cache images.
 **/
const CachedImage = memo(
  ({
    src,
    fallbackSrc,
    errorFallbackSrc,
    type,
    variants,
    decoding = 'async',
    loading,
    priority,
    onError,
    onLoad,
    ...props
  }: CachedImageProps) => {
    const { currentSettings } = useSettings();

    const imageUrl = useMemo(
      () =>
        getImageCacheUrl({
          cacheImages: currentSettings.cacheImages,
          src,
          type,
        }),
      [currentSettings.cacheImages, src, type]
    );
    const fallbackImageUrl = useMemo(
      () =>
        fallbackSrc
          ? getImageCacheUrl({
              cacheImages: currentSettings.cacheImages,
              src: fallbackSrc,
              type,
            })
          : undefined,
      [currentSettings.cacheImages, fallbackSrc, type]
    );
    const errorFallbackImageUrl = useMemo(
      () =>
        errorFallbackSrc
          ? getImageCacheUrl({
              cacheImages: currentSettings.cacheImages,
              src: errorFallbackSrc,
              type,
            })
          : undefined,
      [currentSettings.cacheImages, errorFallbackSrc, type]
    );
    const primaryImageKey = `${type}\u0000${imageUrl}`;
    const [failedPrimaryImageKey, setFailedPrimaryImageKey] =
      useState<string>();
    const fallbackImageKey = fallbackImageUrl
      ? `${type}\u0000${fallbackImageUrl}`
      : undefined;
    const [failedFallbackImageKey, setFailedFallbackImageKey] =
      useState<string>();
    const resolvedVariants = variants?.map((variant) => ({
      ...variant,
      src: getImageCacheUrl({
        cacheImages: currentSettings.cacheImages,
        src: variant.src,
        type,
      }),
    }));
    const progressiveImage = useImageVariants(
      imageUrl,
      resolvedVariants,
      type !== 'avatar'
    );
    const [activeImageUrl, setActiveImageUrl] = useState(() =>
      getInitialImageUrl(type, imageUrl)
    );

    useEffect(() => {
      if (type !== 'avatar' || imageUrl === AVATAR_FALLBACK_IMAGE) {
        setActiveImageUrl(imageUrl);
        return;
      }

      setActiveImageUrl(AVATAR_FALLBACK_IMAGE);

      let avatarPreloader: HTMLImageElement | undefined;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let retryIndex = 0;
      let isCancelled = false;

      const preloadAvatar = () => {
        avatarPreloader = new window.Image();
        avatarPreloader.onload = () => {
          if (!isCancelled) {
            setActiveImageUrl(imageUrl);
          }
        };
        avatarPreloader.onerror = () => {
          if (
            isCancelled ||
            retryIndex >= AVATAR_PRELOAD_RETRY_DELAYS_MS.length
          ) {
            return;
          }

          const retryDelay = AVATAR_PRELOAD_RETRY_DELAYS_MS[retryIndex++];
          retryTimer = setTimeout(preloadAvatar, retryDelay);
        };
        avatarPreloader.src = imageUrl;
      };

      preloadAvatar();

      return () => {
        isCancelled = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
        }
        if (avatarPreloader) {
          avatarPreloader.onload = null;
          avatarPreloader.onerror = null;
        }
      };
    }, [imageUrl, type]);

    if (type === 'avatar' && activeImageUrl === AVATAR_FALLBACK_IMAGE) {
      return (
        <UserIcon
          aria-label={typeof props.alt === 'string' ? props.alt : undefined}
          className={`cached-image-avatar-fallback ${props.className ?? ''}`}
          width={props.width}
          height={props.height}
          role={props.alt ? 'img' : undefined}
        />
      );
    }

    const displayImageUrl =
      type === 'avatar'
        ? activeImageUrl
        : failedFallbackImageKey === fallbackImageKey && errorFallbackImageUrl
          ? errorFallbackImageUrl
          : failedPrimaryImageKey === primaryImageKey && fallbackImageUrl
            ? fallbackImageUrl
            : progressiveImage.src;

    return (
      <Image
        unoptimized
        loader={imageLoader}
        src={displayImageUrl}
        ref={progressiveImage.ref}
        decoding={decoding}
        loading={priority ? undefined : (loading ?? 'lazy')}
        priority={priority}
        onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
          if (type !== 'avatar') progressiveImage.onLoad(event.currentTarget);
          onLoad?.(event);
        }}
        onError={(event: SyntheticEvent<HTMLImageElement>) => {
          if (type !== 'avatar') progressiveImage.onError(event.currentTarget);
          if (
            type !== 'avatar' &&
            displayImageUrl === fallbackImageUrl &&
            fallbackImageKey &&
            errorFallbackImageUrl &&
            errorFallbackImageUrl !== fallbackImageUrl &&
            failedFallbackImageKey !== fallbackImageKey
          ) {
            setFailedFallbackImageKey(fallbackImageKey);
          } else if (
            type !== 'avatar' &&
            fallbackImageUrl &&
            displayImageUrl !== fallbackImageUrl &&
            failedPrimaryImageKey !== primaryImageKey
          ) {
            setFailedPrimaryImageKey(primaryImageKey);
          } else {
            const avatarFallback = getImageErrorFallback(type, displayImageUrl);
            if (avatarFallback) {
              setActiveImageUrl(avatarFallback);
            }
          }
          onError?.(event);
        }}
        {...props}
      />
    );
  }
);

CachedImage.displayName = 'CachedImage';

export default CachedImage;
