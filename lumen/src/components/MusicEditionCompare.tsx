import { api } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { canRequestMusic } from './detail';
import { useToast } from './toast';

type Variant = {
  releaseId: string;
  title: string;
  disambiguation?: string;
  year?: number;
  formats: string[];
  edition:
    'standard' | 'deluxe' | 'remaster' | 'expanded' | 'anniversary' | 'other';
  trackCount: number;
  extraTracks: string[];
  missingTracks: string[];
  evidence: string[];
  isStandard: boolean;
};

const EDITIONS: Variant['edition'][] = [
  'standard',
  'deluxe',
  'remaster',
  'expanded',
  'anniversary',
  'other',
];

export default function MusicEditionCompare({
  releaseGroupId,
}: {
  releaseGroupId: string;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const { data } = useApi<{ variants: Variant[] }>(
    `/collectors/variants/${encodeURIComponent(releaseGroupId)}`
  );
  const variants = data?.variants ?? [];
  if (variants.length < 2) return null;

  const request = async (variant: Variant) => {
    try {
      await api('/request', {
        method: 'POST',
        body: JSON.stringify({
          mediaType: 'music',
          mediaId: releaseGroupId,
          variantKey: variant.releaseId,
        }),
      });
      toast(
        t('lumen.music.editionRequested', 'Requested {title}.', {
          title: variant.title,
        })
      );
    } catch {
      toast(
        t('lumen.music.editionRequestFailed', 'Could not request this edition.')
      );
    }
  };

  return (
    <Section
      id="music-edition-compare"
      title={t('lumen.music.editionCompare', 'Compare Editions')}
    >
      <ul className="setlist">
        {variants.map((variant) => (
          <li className="set set-expanded" key={variant.releaseId}>
            <div className="set-body">
              <h3>{variant.title}</h3>
              <p className="note">
                {[
                  t(
                    `lumen.music.edition.${variant.edition}`,
                    EDITIONS.includes(variant.edition)
                      ? variant.edition
                      : 'Other'
                  ),
                  variant.disambiguation,
                  variant.year,
                  variant.formats.join(', '),
                  t('lumen.music.editionTrackCount', '{count} tracks', {
                    count: variant.trackCount,
                  }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {!!variant.extraTracks.length && (
                <p>
                  {t('lumen.music.extraTracks', 'Additional tracks: {tracks}', {
                    tracks: variant.extraTracks.slice(0, 8).join(', '),
                  })}
                </p>
              )}
              {!!variant.missingTracks.length && (
                <p>
                  {t('lumen.music.missingTracks', 'Missing tracks: {tracks}', {
                    tracks: variant.missingTracks.slice(0, 8).join(', '),
                  })}
                </p>
              )}
              {variant.evidence.map((line) => (
                <p className="note" key={line}>
                  {line}
                </p>
              ))}
            </div>
            {canRequestMusic(user?.permissions) && (
              <button
                className="btn btn-tonal btn-sm"
                onClick={() => void request(variant)}
              >
                {t('lumen.music.requestEdition', 'Request this edition')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="note">
        {t(
          'lumen.music.editionMasteringNote',
          'Audio mastering can vary between releases; track lists alone do not determine sound quality.'
        )}
      </p>
    </Section>
  );
}
