import {
  DiscoverSliderType,
  isTmdbPublicListId,
  MAX_DISCOVER_KEYWORD_IDS,
  MAX_DISCOVER_SLIDER_DATA_LENGTH,
  MAX_DISCOVER_SLIDER_TITLE_LENGTH,
  MAX_DISCOVER_SLIDERS,
  MAX_TMDB_PUBLIC_LIST_ID_LENGTH,
} from '@server/constants/discover';
import dataSource, { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import { runDiscoverSliderMutation } from '@server/lib/discoverSliderMutation';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { parseBoundedString } from '@server/utils/validation';
import { Router } from 'express';

const discoverSettingRoutes = Router();
const MAX_STREAMING_PROVIDERS = 100;
const MAX_TMDB_SEARCH_LENGTH = 256;
const listenBrainzChartValues = new Set([
  'popular.week',
  'popular.month',
  'popular.year',
]);

class SliderValidationError extends Error {}
class SliderLimitError extends Error {}

const isValidSliderType = (value: unknown): value is DiscoverSliderType =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  Object.values(DiscoverSliderType).includes(value);

const parseSliderId = (value: unknown): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return undefined;
  }

  return value;
};

const parseSliderObject = (
  value: unknown
): { value: Partial<DiscoverSlider> } | { error: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Slider must be an object.' };
  }

  return { value: value as Partial<DiscoverSlider> };
};

const parseCustomSlider = (
  value: unknown
):
  | { value: Pick<DiscoverSlider, 'data' | 'title' | 'type'> }
  | {
      error: string;
    } => {
  const parsedSlider = parseSliderObject(value);
  if ('error' in parsedSlider) {
    return parsedSlider;
  }
  const slider = parsedSlider.value;

  const title = parseBoundedString(slider.title, {
    fieldName: 'Slider title',
    maxLength: MAX_DISCOVER_SLIDER_TITLE_LENGTH,
  });

  if ('error' in title) {
    return title;
  }

  const data = parseBoundedString(slider.data, {
    fieldName: 'Slider data',
    maxLength: MAX_DISCOVER_SLIDER_DATA_LENGTH,
  });

  if ('error' in data) {
    return data;
  }

  if (!isValidSliderType(slider.type)) {
    return { error: 'Slider type is invalid.' };
  }

  let normalizedData = data.value;
  if (
    slider.type === DiscoverSliderType.TMDB_MOVIE_KEYWORD ||
    slider.type === DiscoverSliderType.TMDB_TV_KEYWORD
  ) {
    const ids = data.value.split(',');
    if (ids.length > MAX_DISCOVER_KEYWORD_IDS) {
      return {
        error: `Slider keywords are limited to ${MAX_DISCOVER_KEYWORD_IDS} ids.`,
      };
    }
    const normalizedIds: number[] = [];
    const seen = new Set<number>();
    for (const rawId of ids) {
      const value = rawId.trim();
      if (!/^[1-9]\d*$/.test(value)) {
        return { error: 'Slider keywords must be positive decimal ids.' };
      }
      const id = parsePositiveRouteId(value);
      if (!id) {
        return { error: 'Slider keyword id is invalid.' };
      }
      if (!seen.has(id)) {
        seen.add(id);
        normalizedIds.push(id);
      }
    }
    normalizedData = normalizedIds.join(',');
  } else if (
    slider.type === DiscoverSliderType.TMDB_MOVIE_GENRE ||
    slider.type === DiscoverSliderType.TMDB_TV_GENRE ||
    slider.type === DiscoverSliderType.TMDB_STUDIO ||
    slider.type === DiscoverSliderType.TMDB_NETWORK
  ) {
    const id = parsePositiveRouteId(data.value);
    if (!id) {
      return { error: 'Slider provider id must be a positive decimal id.' };
    }
    normalizedData = String(id);
  } else if (
    slider.type === DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES ||
    slider.type === DiscoverSliderType.TMDB_TV_STREAMING_SERVICES
  ) {
    const parts = data.value.split(',');
    if (parts.length !== 2 || !/^[A-Za-z]{2}$/.test(parts[0].trim())) {
      return {
        error:
          'Streaming slider data must contain a two-letter region and provider ids.',
      };
    }
    const rawProviders = parts[1].split('|');
    if (
      rawProviders.length === 0 ||
      rawProviders.length > MAX_STREAMING_PROVIDERS
    ) {
      return {
        error: `Streaming sliders require 1 to ${MAX_STREAMING_PROVIDERS} providers.`,
      };
    }
    const providers: number[] = [];
    const seenProviders = new Set<number>();
    for (const rawProvider of rawProviders) {
      const provider = parsePositiveRouteId(rawProvider.trim());
      if (!provider) {
        return { error: 'Streaming slider provider id is invalid.' };
      }
      if (!seenProviders.has(provider)) {
        seenProviders.add(provider);
        providers.push(provider);
      }
    }
    normalizedData = `${parts[0].trim().toUpperCase()},${providers.join('|')}`;
  } else if (slider.type === DiscoverSliderType.TMDB_LIST) {
    if (!isTmdbPublicListId(data.value)) {
      return {
        error: `TMDB list ID must be a positive decimal ID of ${MAX_TMDB_PUBLIC_LIST_ID_LENGTH} digits or fewer.`,
      };
    }
  } else if (
    slider.type === DiscoverSliderType.TMDB_SEARCH &&
    data.value.length > MAX_TMDB_SEARCH_LENGTH
  ) {
    return {
      error: `Search slider data must be ${MAX_TMDB_SEARCH_LENGTH} characters or fewer.`,
    };
  } else if (
    slider.type === DiscoverSliderType.LISTENBRAINZ_MUSIC_CHART &&
    !listenBrainzChartValues.has(data.value)
  ) {
    return { error: 'ListenBrainz chart is invalid.' };
  }

  return {
    value: {
      data: normalizedData,
      title: title.value,
      type: slider.type,
    },
  };
};

discoverSettingRoutes.post(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const sliders = req.body as Partial<DiscoverSlider>[];

    if (!Array.isArray(sliders) || sliders.length > MAX_DISCOVER_SLIDERS) {
      return res.status(400).json({ message: 'Invalid request body.' });
    }

    try {
      const savedSliders = await runDiscoverSliderMutation(() =>
        dataSource.transaction(async (manager) => {
          const sliderRepository = manager.getRepository(DiscoverSlider);
          const plannedSliders: DiscoverSlider[] = [];
          const seenIds = new Set<number>();
          const existingCount = await sliderRepository.count();
          let newSliderCount = 0;

          // Build and validate the complete plan before saving any row. This keeps
          // a malformed later entry from partially applying the requested order.
          for (let x = 0; x < sliders.length; x++) {
            const parsedSliderObject = parseSliderObject(sliders[x]);
            if ('error' in parsedSliderObject) {
              throw new SliderValidationError(parsedSliderObject.error);
            }
            const slider = parsedSliderObject.value;
            const sliderId = parseSliderId(slider.id);

            if (slider.id !== undefined && slider.id !== null && !sliderId) {
              throw new SliderValidationError('Slider id is invalid.');
            }
            if (sliderId && seenIds.has(sliderId)) {
              throw new SliderValidationError('Slider ids must be unique.');
            }
            if (sliderId) {
              seenIds.add(sliderId);
            }

            const existingSlider = sliderId
              ? await sliderRepository.findOne({ where: { id: sliderId } })
              : null;

            if (sliderId && !existingSlider) {
              throw new SliderValidationError('Slider does not exist.');
            }

            if (existingSlider) {
              existingSlider.enabled =
                typeof slider.enabled === 'boolean' ? slider.enabled : false;
              existingSlider.order = x;

              if (!existingSlider.isBuiltIn) {
                const parsedSlider = parseCustomSlider(slider);
                if ('error' in parsedSlider) {
                  throw new SliderValidationError(parsedSlider.error);
                }
                existingSlider.title = parsedSlider.value.title;
                existingSlider.data = parsedSlider.value.data;
                existingSlider.type = parsedSlider.value.type;
              }
              plannedSliders.push(existingSlider);
            } else {
              const parsedSlider = parseCustomSlider(slider);
              if ('error' in parsedSlider) {
                throw new SliderValidationError(parsedSlider.error);
              }
              newSliderCount += 1;
              if (existingCount + newSliderCount > MAX_DISCOVER_SLIDERS) {
                throw new SliderLimitError(
                  'Maximum number of sliders reached.'
                );
              }
              plannedSliders.push(
                new DiscoverSlider({
                  isBuiltIn: false,
                  data: parsedSlider.value.data,
                  title: parsedSlider.value.title,
                  enabled:
                    typeof slider.enabled === 'boolean'
                      ? slider.enabled
                      : false,
                  order: x,
                  type: parsedSlider.value.type,
                })
              );
            }
          }

          return sliderRepository.save(plannedSliders);
        })
      );

      return res.json(savedSliders);
    } catch (error) {
      if (error instanceof SliderValidationError) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof SliderLimitError) {
        return res.status(409).json({ message: error.message });
      }
      logger.error('Something went wrong updating discovery sliders.', {
        label: 'API',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return next({ status: 500, message: 'Unable to update sliders.' });
    }
  })
);

discoverSettingRoutes.post(
  '/add',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const parsedSlider = parseCustomSlider(req.body);

    if ('error' in parsedSlider) {
      return res.status(400).json({ message: parsedSlider.error });
    }

    try {
      const newSlider = await runDiscoverSliderMutation(() =>
        dataSource.transaction(async (manager) => {
          const sliderRepository = manager.getRepository(DiscoverSlider);
          if ((await sliderRepository.count()) >= MAX_DISCOVER_SLIDERS) {
            throw new SliderLimitError('Maximum number of sliders reached.');
          }

          return sliderRepository.save(
            new DiscoverSlider({
              isBuiltIn: false,
              data: parsedSlider.value.data,
              title: parsedSlider.value.title,
              enabled: false,
              order: -1,
              type: parsedSlider.value.type,
            })
          );
        })
      );

      return res.json(newSlider);
    } catch (error) {
      if (error instanceof SliderLimitError) {
        return res.status(409).json({ message: error.message });
      }
      logger.error('Something went wrong adding a discovery slider.', {
        label: 'API',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return next({ status: 500, message: 'Unable to add slider.' });
    }
  })
);

discoverSettingRoutes.post(
  '/reset',
  authorizedMutation(Permission.ADMIN, async (_req, res) => {
    await runDiscoverSliderMutation(() =>
      dataSource.transaction(async (manager) => {
        const sliderRepository = manager.getRepository(DiscoverSlider);
        await sliderRepository.clear();
        await DiscoverSlider.bootstrapSliders(sliderRepository);
      })
    );

    return res.status(204).send();
  })
);

discoverSettingRoutes.put(
  '/:sliderId',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const sliderRepository = getRepository(DiscoverSlider);
    const sliderId = parsePositiveRouteId(req.params.sliderId);
    if (!sliderId) {
      return next({
        status: 404,
        message: 'Slider not found or cannot be updated.',
      });
    }

    const parsedSlider = parseCustomSlider(req.body);

    if ('error' in parsedSlider) {
      return res.status(400).json({ message: parsedSlider.error });
    }

    try {
      const existingSlider = await runDiscoverSliderMutation(async () => {
        const current = await sliderRepository.findOneOrFail({
          where: { id: sliderId },
        });

        // Only allow changes to the following when the slider is not built in
        if (!current.isBuiltIn) {
          current.title = parsedSlider.value.title;
          current.data = parsedSlider.value.data;
          current.type = parsedSlider.value.type;
        }

        return sliderRepository.save(current);
      });

      return res.status(200).json(existingSlider);
    } catch (e) {
      logger.error('Something went wrong updating a slider.', {
        label: 'API',
        errorMessage: e.message,
      });
      next({ status: 404, message: 'Slider not found or cannot be updated.' });
    }
  })
);

discoverSettingRoutes.delete(
  '/:sliderId',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const sliderRepository = getRepository(DiscoverSlider);
    const sliderId = parsePositiveRouteId(req.params.sliderId);
    if (!sliderId) {
      return next({
        status: 404,
        message: 'Slider not found or cannot be deleted.',
      });
    }

    try {
      await runDiscoverSliderMutation(async () => {
        const slider = await sliderRepository.findOneOrFail({
          where: { id: sliderId, isBuiltIn: false },
        });
        await sliderRepository.remove(slider);
      });

      return res.status(204).send();
    } catch (e) {
      logger.error('Something went wrong deleting a slider.', {
        label: 'API',
        errorMessage: e.message,
      });
      next({ status: 404, message: 'Slider not found or cannot be deleted.' });
    }
  })
);

export default discoverSettingRoutes;
