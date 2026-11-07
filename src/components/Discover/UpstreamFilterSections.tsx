import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { ChevronDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import { useState, type ReactNode } from 'react';
export default function UpstreamFilterSections({
  sections,
}: {
  sections: { section: string; label: string; children: ReactNode }[];
}) {
  const [active, setActive] = useState<string>();
  const current = sections.find((s) => s.section === active);
  return (
    <div className="upstream-filter-sections">
      {sections.map((section) =>
        section.section === 'sortBy' ? (
          <Popover key={section.section} className="upstream-filter-menu">
            {({ close }) => (
              <>
                <PopoverButton className="app-button app-button-default button-standard">
                  <span>{section.label}</span>
                  <ChevronDownIcon aria-hidden="true" />
                </PopoverButton>
                <PopoverPanel
                  anchor="bottom end"
                  className="upstream-filter-options"
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest('button')
                    )
                      close();
                  }}
                >
                  {section.children}
                </PopoverPanel>
              </>
            )}
          </Popover>
        ) : (
          <Button
            key={section.section}
            onClick={() => setActive(section.section)}
          >
            <FunnelIcon aria-hidden="true" />
            {section.label}
          </Button>
        )
      )}
      <SlideOver
        show={Boolean(current)}
        title={current?.label}
        onClose={() => setActive(undefined)}
      >
        {current?.children}
      </SlideOver>
    </div>
  );
}
