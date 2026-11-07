import UpstreamFilterSections from '@app/components/Discover/UpstreamFilterSections';
import DetailDisclosureButton from '@app/components/MediaDetails/DetailDisclosureButton';
import useDetailDisclosurePins from '@app/hooks/useDetailDisclosurePins';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import type {
  DetailDisclosureMediaType,
  DetailDisclosurePin,
} from '@server/interfaces/api/userSettingsInterfaces';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type PinnedFilterSectionName = Extract<
  DetailDisclosurePin,
  'taskFilters' | 'filters' | 'mediaFilters' | 'sortBy'
>;

const filterSectionNames: PinnedFilterSectionName[] = [
  'taskFilters',
  'mediaFilters',
  'filters',
  'sortBy',
];

export function PinnedFilterSectionGroup({
  mediaType,
  sections,
}: {
  mediaType: DetailDisclosureMediaType;
  sections: {
    section: PinnedFilterSectionName;
    label: string;
    children: ReactNode;
  }[];
}) {
  const upstream = useUpstreamTheme();
  const { pins, togglePinned } = useDetailDisclosurePins(mediaType);
  const groupId = useId();
  const [openSections, setOpenSections] = useState<
    Record<PinnedFilterSectionName, boolean>
  >(() => ({
    taskFilters: Boolean(pins.taskFilters),
    mediaFilters: Boolean(pins.mediaFilters),
    filters: Boolean(pins.filters),
    sortBy: Boolean(pins.sortBy),
  }));
  const previousPins = useRef(pins);

  useEffect(() => {
    // Capture transitions before queueing an updater: React can run the
    // updater after this effect has advanced the previous-pin snapshot.
    const changes = filterSectionNames
      .filter((section) => previousPins.current[section] !== pins[section])
      .map((section) => ({ section, open: Boolean(pins[section]) }));
    previousPins.current = pins;

    if (changes.length) {
      setOpenSections((current) => {
        const next = { ...current };
        for (const { section, open } of changes) {
          next[section] = open;
        }
        return next;
      });
    }
  }, [pins]);

  if (upstream) return <UpstreamFilterSections sections={sections} />;

  return (
    <div className="app-pinned-filter-group">
      {sections.map(({ section, label, children }) => {
        const controls = `${groupId}-${section}`;
        return (
          <section
            key={section}
            className="pinned-filter-section app-pinned-filter-section"
            aria-label={label}
          >
            <div className="media-detail-disclosure-row">
              <DetailDisclosureButton
                label={label}
                open={openSections[section]}
                onClick={() =>
                  setOpenSections((current) => ({
                    ...current,
                    [section]: !current[section],
                  }))
                }
                pinned={pins[section]}
                onPinClick={() => void togglePinned(section)}
                controls={controls}
              />
            </div>
            {openSections[section] ? (
              <div id={controls} className="app-pinned-filter-panel">
                {children}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default function PinnedFilterSection({
  mediaType,
  section,
  label,
  children,
}: {
  mediaType: DetailDisclosureMediaType;
  section: 'filters' | 'mediaFilters' | 'sortBy';
  label: string;
  children: ReactNode;
}) {
  const upstream = useUpstreamTheme();
  const { pins, togglePinned } = useDetailDisclosurePins(mediaType);
  const [open, setOpen] = useState(false);
  const sectionPinned = Boolean(pins[section]);
  useEffect(() => setOpen(sectionPinned), [sectionPinned]);
  if (upstream)
    return <UpstreamFilterSections sections={[{ section, label, children }]} />;

  return (
    <section className="pinned-filter-section app-pinned-filter-section">
      <div className="media-detail-disclosure-row">
        <DetailDisclosureButton
          label={label}
          open={open}
          onClick={() => setOpen((value) => !value)}
          pinned={pins[section]}
          onPinClick={() => void togglePinned(section)}
        />
      </div>
      {open && <div className="app-pinned-filter-panel">{children}</div>}
    </section>
  );
}
