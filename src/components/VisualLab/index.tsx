import PageTitle from '@app/components/Common/PageTitle';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.VisualLab', {
  title: 'Visual Lab',
  titleText: 'Title Text',
  titleTextDescription:
    'Compare title fills, palettes, gradients, and text treatments.',
  borders: 'Borders',
  bordersDescription:
    'Experiment with card borders, bevels, and edge treatments.',
  buttons: 'Buttons',
  buttonsDescription:
    'Compare button palettes, fills, borders, and interaction treatments.',
  seriesTestingPage: 'Series Testing Page',
  seriesTestingDescription:
    'Compare season and episode selection layouts inside the series details card.',
  paletteTreatmentFilter: 'Palette treatment filter',
  allPalettes: 'All',
  solidPalette: 'Solid',
  gradientPalette: 'Gradient',
  metallicPalette: 'Metallic',
});

const formatTreatmentLabel = (treatmentClass: string) =>
  treatmentClass
    .replace(/^css-/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const paletteFilterControls = `
  <nav class="visual-lab-palette-filters" aria-label="Palette treatment filter">
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="all" aria-pressed="true">All</button>
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="solid" aria-pressed="false">Solid</button>
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="gradiant" aria-pressed="false">Gradiant</button>
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="metalic" aria-pressed="false">Metalic</button>
  </nav>`;

const paletteFilterScript = `
  <script>
    (() => {
      const storageKey = 'visual-lab-palette-family-filter';
      const storage = parent.sessionStorage;
      const filters = Array.from(document.querySelectorAll('[data-palette-filter]'));
      const sections = Array.from(document.querySelectorAll('[data-palette-family]'));

      const applyFilter = (requestedFilter) => {
        const filter = ['solid', 'gradiant', 'metalic'].includes(requestedFilter)
          ? requestedFilter
          : 'all';

        sections.forEach((section) => {
          section.hidden = filter !== 'all' && section.dataset.paletteFamily !== filter;
        });
        filters.forEach((button) => {
          button.setAttribute(
            'aria-pressed',
            button.dataset.paletteFilter === filter ? 'true' : 'false',
          );
        });
        storage.setItem(storageKey, filter);
      };

      filters.forEach((button) => {
        button.addEventListener('click', () => applyFilter(button.dataset.paletteFilter));
      });

      applyFilter(storage.getItem(storageKey) || 'all');
    })();
  </script>`;

const gradiantTitle = (treatmentClass: string) => {
  const label = formatTreatmentLabel(treatmentClass);

  return `
  <div class="visual-lab-title-group">
    <div class="visual-lab-style-name">${label}</div>
    <div class="page-title gradiant-text ${treatmentClass}">Page Title</div>
    <div class="card-title gradiant-text ${treatmentClass}">Card Title</div>
    <div class="card-heading1 gradiant-text ${treatmentClass}">Card Heading</div>
  </div>`;
};

const metalicTitle = (treatmentClass: string) => {
  const label = formatTreatmentLabel(treatmentClass);

  return `
  <div class="visual-lab-title-group">
    <div class="visual-lab-style-name">${label}</div>
    <div class="page-title metalic-text ${treatmentClass} page-title-${treatmentClass}">Page Title</div>
    <div class="card-title metalic-text ${treatmentClass} card-title-${treatmentClass}">Card Title</div>
    <div class="card-heading1 metalic-text ${treatmentClass} card-heading-${treatmentClass}">Card Heading</div>
  </div>`;
};

const chromeTitle = () => `
  <div class="visual-lab-title-group">
    <div class="visual-lab-style-name">Metalic Chrome</div>
    <div class="page-title metalic-text metalic-chrome page-title-chrome">Page Title</div>
    <div class="card-title metalic-text metalic-chrome card-title-chrome">Card Title</div>
    <div class="card-heading1 metalic-text metalic-chrome card-heading-chrome">Card Heading</div>
  </div>`;

const liquidChromeTitle = () => `
  <div class="visual-lab-title-group">
    <div class="visual-lab-style-name">Liquid Chrome</div>
    <div class="page-title metalic-text liquid-chrome">Page Title</div>
    <div class="card-title metalic-text liquid-chrome">Card Title</div>
    <div class="card-heading1 metalic-text liquid-chrome">Card Heading</div>
  </div>`;

const solidTitle = (treatmentClass: string) => {
  const label = formatTreatmentLabel(treatmentClass);

  return `
  <div class="visual-lab-title-group">
    <div class="visual-lab-style-name">${label}</div>
    <div class="page-title solid-text ${treatmentClass}">Page Title</div>
    <div class="card-title solid-text ${treatmentClass}">Card Title</div>
    <div class="card-heading1 solid-text ${treatmentClass}">Card Heading</div>
  </div>`;
};

const borderCard = (
  label: string,
  treatmentClass = '',
  chrome = false,
  metallicFill = false
) => `
  <article class="visual-lab-border-card ${
    chrome
      ? 'settings-main-card app-card-main visual-lab-border-chrome'
      : 'visual-lab-color-border-card'
  } ${treatmentClass} ${metallicFill ? 'visual-lab-metallic-fill-card' : ''}">
    <h2 class="card-title">${label}</h2>
  </article>`;

const borderColumnHeadings = `
  <div class="visual-lab-border-column-heading">Light</div>
  <div class="visual-lab-border-column-heading">Normal</div>
  <div class="visual-lab-border-column-heading">Dark</div>`;

const styleDisplayName = (className: string) =>
  className
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const borderPaletteCard = (treatmentClass: string, metallicFill = false) =>
  borderCard(
    styleDisplayName(treatmentClass),
    treatmentClass,
    false,
    metallicFill
  );

const borderPaletteCards = (metallicFill = false) => `
  ${titlePaletteClasses
    .flat()
    .map((color) => borderPaletteCard(`metalic-${color}`, metallicFill))
    .join('')}`;

const gradiantBorderCard = (label: string, treatmentClass: string) => `
  <article class="visual-lab-border-card visual-lab-color-border-card visual-lab-gradiant-border-card ${treatmentClass}">
    <h2 class="card-title">${label}</h2>
  </article>`;

const solidBorderCard = (treatmentClass: string) => `
  <article class="visual-lab-border-card visual-lab-color-border-card visual-lab-solid-border-card ${treatmentClass}">
    <h2 class="card-title">${styleDisplayName(treatmentClass)}</h2>
  </article>`;

const solidBorderPaletteCards = () =>
  titlePaletteClasses
    .flat()
    .map((color) => solidBorderCard(`solid-${color}`))
    .join('');

const gradiantBorderPaletteCards = () =>
  titlePaletteClasses
    .flat()
    .map((color) =>
      gradiantBorderCard(
        styleDisplayName(`gradiant-${color}`),
        `gradiant-${color}`
      )
    )
    .join('');

const titlePaletteClasses = [
  ['light-gray', 'gray', 'dark-gray'],
  ['light-black', 'black', 'dark-black'],
  ['light-red', 'red', 'dark-red'],
  ['light-orange', 'orange', 'dark-orange'],
  ['light-yellow', 'yellow', 'dark-yellow'],
  ['light-lime', 'lime', 'dark-lime'],
  ['light-green', 'green', 'dark-green'],
  ['light-aqua', 'aqua', 'dark-aqua'],
  ['light-blue', 'blue', 'dark-blue'],
  ['light-purple', 'purple', 'dark-purple'],
  ['light-plum', 'plum', 'dark-plum'],
  ['light-pink', 'pink', 'dark-pink'],
];

const metalicTitlePaletteGrid = () =>
  titlePaletteClasses
    .flat()
    .map((color) => metalicTitle(`metalic-${color}`))
    .join('');

const gradiantTitlePaletteGrid = () =>
  titlePaletteClasses
    .flat()
    .map((color) => gradiantTitle(`gradiant-${color}`))
    .join('');

const solidTitlePaletteGrid = () =>
  titlePaletteClasses
    .flat()
    .map((color) => solidTitle(`solid-${color}`))
    .join('');

const titleTextSections = () => `
  <section class="visual-lab-title-section" data-palette-family="solid">
    <h2 class="page-heading">Solid Title</h2>
    <div class="visual-lab-title-grid">
      ${borderColumnHeadings}
      ${solidTitle('solid-steel')}
      ${solidTitle('solid-metalic-chrome')}
      ${solidTitle('solid-liquid-chrome')}
      ${solidTitlePaletteGrid()}
    </div>
  </section>

  <section class="visual-lab-title-section" data-palette-family="gradiant">
    <h2 class="page-heading">Gradiant Title</h2>
    <div class="visual-lab-title-grid">
      ${borderColumnHeadings}
      ${gradiantTitle('gradiant-steel')}
      ${gradiantTitle('gradiant-metalic-chrome')}
      ${gradiantTitle('gradiant-liquid-chrome')}
      ${gradiantTitlePaletteGrid()}
    </div>
  </section>

  <section class="visual-lab-title-section" data-palette-family="metalic">
    <h2 class="page-heading">Metalic Title</h2>
    <div class="visual-lab-title-grid">
      ${borderColumnHeadings}
      ${metalicTitle('metalic-steel')}
      ${chromeTitle()}
      ${liquidChromeTitle()}
      ${metalicTitlePaletteGrid()}
    </div>
  </section>`;

const titleTextDocument = `<!doctype html>
<html lang="en" class="dark" data-theme-mode="dark" data-theme-palette="seerr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/visual-lab/visual-lab.css?v=palette-filters" />
  </head>
  <body class="visual-lab-canvas">
    <main class="app-shell relative min-h-screen p-4">
      <div class="app-backdrop pointer-events-none fixed inset-0 h-full w-full"></div>
      <section class="relative z-10 mx-auto w-full max-w-6xl space-y-8">
        <h1 class="page-title">Title Text</h1>
        ${paletteFilterControls}
        ${titleTextSections()}
        <section class="settings-main-card app-card-main visual-lab-title-card">
          ${titleTextSections()}
        </section>
      </section>
    </main>
    ${paletteFilterScript}
    <script>
      (() => {
        const scrollKey = 'visual-lab-title-text-scroll-y';
        const scrollStorage = parent.sessionStorage;
        const saveScrollPosition = () => {
          scrollStorage.setItem(scrollKey, String(window.scrollY));
        };
        const restoreScrollPosition = () => {
          const savedPosition = Number(scrollStorage.getItem(scrollKey));
          if (Number.isFinite(savedPosition) && savedPosition > 0) {
            window.scrollTo(0, savedPosition);
          }
        };

        window.addEventListener('scroll', saveScrollPosition, { passive: true });
        window.addEventListener('pagehide', saveScrollPosition);
        window.addEventListener('beforeunload', saveScrollPosition);
        window.addEventListener('DOMContentLoaded', restoreScrollPosition);
        window.addEventListener('load', restoreScrollPosition);
        setTimeout(restoreScrollPosition, 100);
        setTimeout(restoreScrollPosition, 500);
        restoreScrollPosition();
      })();
    </script>
  </body>
</html>`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const withDocumentTitle = (document: string, title: string) =>
  document.replace(
    /<h1 class="page-title">[^<]*<\/h1>/,
    `<h1 class="page-title">${escapeHtml(title)}</h1>`
  );

const withPaletteFilterControls = (
  document: string,
  labels: Record<string, string>
) =>
  document.replace(
    paletteFilterControls,
    `<nav class="visual-lab-palette-filters" aria-label="${escapeHtml(labels.paletteTreatmentFilter)}">
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="all" aria-pressed="true">${escapeHtml(labels.allPalettes)}</button>
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="solid" aria-pressed="false">${escapeHtml(labels.solidPalette)}</button>
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="gradiant" aria-pressed="false">${escapeHtml(labels.gradientPalette)}</button>
    <button class="app-button button-md visual-lab-filter-button" type="button" data-palette-filter="metalic" aria-pressed="false">${escapeHtml(labels.metallicPalette)}</button>
  </nav>`
  );

const withDocumentLocale = (document: string, locale: string) => {
  const language = locale.replace(/_/g, '-');
  const direction = language.startsWith('ar') ? 'rtl' : 'ltr';
  return document.replace(
    '<html lang="en"',
    `<html lang="${escapeHtml(language)}" dir="${direction}"`
  );
};

const visualLabIndexDocument = (
  labels: Record<string, string>
) => `<!doctype html>
<html lang="${escapeHtml(labels.locale)}" dir="${escapeHtml(labels.direction)}" class="dark" data-theme-mode="dark" data-theme-palette="seerr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/visual-lab/visual-lab.css?v=metalic" />
  </head>
  <body class="visual-lab-canvas">
    <main class="app-shell relative min-h-screen p-4">
      <div class="app-backdrop pointer-events-none fixed inset-0 h-full w-full"></div>
      <section class="relative z-10 mx-auto w-full max-w-4xl space-y-8">
        <h1 class="page-title">${escapeHtml(labels.title)}</h1>
        <div class="grid gap-6 sm:grid-cols-2">
          <a class="settings-main-card app-card-main block" href="/visual-lab/title-text" target="_top">
            <h2 class="card-title">${escapeHtml(labels.titleText)}</h2>
            <p>${escapeHtml(labels.titleTextDescription)}</p>
          </a>
          <a class="settings-main-card app-card-main block" href="/visual-lab/borders" target="_top">
            <h2 class="card-title">${escapeHtml(labels.borders)}</h2>
            <p>${escapeHtml(labels.bordersDescription)}</p>
          </a>
          <a class="settings-main-card app-card-main block" href="/visual-lab/buttons" target="_top">
            <h2 class="card-title">${escapeHtml(labels.buttons)}</h2>
            <p>${escapeHtml(labels.buttonsDescription)}</p>
          </a>
          <a class="settings-main-card app-card-main" href="/visual-lab/testing" target="_top">
            <h2 class="card-title">${escapeHtml(labels.seriesTestingPage)}</h2>
            <p>${escapeHtml(labels.seriesTestingDescription)}</p>
          </a>
        </div>
      </section>
    </main>
  </body>
</html>`;

const paintbrushIcon = `
  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
    <path stroke-linecap="round" stroke-linejoin="round" d="m14 4 6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8L14 4Z"/>
    <path stroke-linecap="round" stroke-linejoin="round" d="M5.5 16.7C3.2 16.7 2 18.2 2 20c1.2-.7 2.3-.3 3.4.1 1.3.5 2.5-.2 2.5-1.6"/>
  </svg>`;

const buttonStateExample = (
  treatmentClass: string,
  state: 'normal' | 'dimmed' | 'active' | 'hover'
) => `
  <div class="visual-lab-button-cell">
    <button
      class="app-button button-md ${treatmentClass}${state === 'active' ? ' visual-lab-button-state-active' : ''}${state === 'hover' ? ' visual-lab-button-state-hover' : ''}"
      type="button"
      ${state === 'dimmed' ? 'disabled' : ''}
      ${state === 'active' ? 'aria-pressed="true"' : ''}
    >
      <span class="flex max-w-full items-center">${paintbrushIcon}Button Text</span>
    </button>
  </div>`;

const buttonStateRow = (label: string, treatmentClass: string) => `
  <div class="visual-lab-button-row-label">${label}</div>
  ${buttonStateExample(treatmentClass, 'normal')}
  ${buttonStateExample(treatmentClass, 'dimmed')}
  ${buttonStateExample(treatmentClass, 'active')}
  ${buttonStateExample(treatmentClass, 'hover')}`;

const metalicButtonPaletteRows = () =>
  titlePaletteClasses
    .flat()
    .map((color) =>
      buttonStateRow(
        `${styleDisplayName(color)} Palette`,
        `visual-lab-button-metalic metalic-${color}`
      )
    )
    .join('');

const gradiantButtonPaletteRows = () =>
  titlePaletteClasses
    .flat()
    .map((color) =>
      buttonStateRow(
        `${styleDisplayName(color)} Palette`,
        `visual-lab-button-gradiant gradiant-${color}`
      )
    )
    .join('');

const buttonsDocument = `<!doctype html>
<html lang="en" class="dark" data-theme-mode="dark" data-theme-palette="seerr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/visual-lab/visual-lab.css?v=palette-filters" />
  </head>
  <body class="visual-lab-canvas">
    <main class="app-shell relative min-h-screen p-4">
      <div class="app-backdrop pointer-events-none fixed inset-0 h-full w-full"></div>
      <section class="relative z-10 mx-auto w-full max-w-6xl space-y-8">
        <h1 class="page-title">Buttons</h1>
        ${paletteFilterControls}
        <section class="visual-lab-button-section" data-palette-family="solid">
          <h2 class="visual-lab-button-section-title">Solid Palette Buttons</h2>
          <div class="visual-lab-button-grid">
            <div class="visual-lab-border-column-heading">Normal</div>
            <div class="visual-lab-border-column-heading">Dimmed</div>
            <div class="visual-lab-border-column-heading">Active</div>
            <div class="visual-lab-border-column-heading">Hover</div>
            ${buttonStateRow(
              'Light Gray Palette',
              'visual-lab-button-palette visual-lab-button-light-gray'
            )}
            ${buttonStateRow(
              'Gray Palette',
              'visual-lab-button-palette visual-lab-button-gray'
            )}
            ${buttonStateRow(
              'Dark Gray Palette',
              'visual-lab-button-palette visual-lab-button-dark-gray'
            )}
            ${buttonStateRow(
              'Light Black Palette',
              'visual-lab-button-palette visual-lab-button-light-black'
            )}
            ${buttonStateRow(
              'Black Palette',
              'visual-lab-button-palette visual-lab-button-black'
            )}
            ${buttonStateRow(
              'Dark Black Palette',
              'visual-lab-button-palette visual-lab-button-dark-black'
            )}
            ${buttonStateRow(
              'Light Red Palette',
              'visual-lab-button-palette visual-lab-button-light-red'
            )}
            ${buttonStateRow(
              'Red Palette',
              'visual-lab-button-palette visual-lab-button-red'
            )}
            ${buttonStateRow(
              'Dark Red Palette',
              'visual-lab-button-palette visual-lab-button-dark-red'
            )}
            ${buttonStateRow(
              'Light Orange Palette',
              'visual-lab-button-palette visual-lab-button-light-orange'
            )}
            ${buttonStateRow(
              'Orange Palette',
              'visual-lab-button-palette visual-lab-button-orange'
            )}
            ${buttonStateRow(
              'Dark Orange Palette',
              'visual-lab-button-palette visual-lab-button-dark-orange'
            )}
            ${buttonStateRow(
              'Light Yellow Palette',
              'visual-lab-button-palette visual-lab-button-light-yellow'
            )}
            ${buttonStateRow(
              'Yellow Palette',
              'visual-lab-button-palette visual-lab-button-yellow'
            )}
            ${buttonStateRow(
              'Dark Yellow Palette',
              'visual-lab-button-palette visual-lab-button-dark-yellow'
            )}
            ${buttonStateRow(
              'Light Lime Palette',
              'visual-lab-button-palette visual-lab-button-light-lime'
            )}
            ${buttonStateRow(
              'Lime Palette',
              'visual-lab-button-palette visual-lab-button-lime'
            )}
            ${buttonStateRow(
              'Dark Lime Palette',
              'visual-lab-button-palette visual-lab-button-dark-lime'
            )}
            ${buttonStateRow(
              'Light Green Palette',
              'visual-lab-button-palette visual-lab-button-light-green'
            )}
            ${buttonStateRow(
              'Green Palette',
              'visual-lab-button-palette visual-lab-button-green'
            )}
            ${buttonStateRow(
              'Dark Green Palette',
              'visual-lab-button-palette visual-lab-button-dark-green'
            )}
            ${buttonStateRow(
              'Light Aqua Palette',
              'visual-lab-button-palette visual-lab-button-light-aqua'
            )}
            ${buttonStateRow(
              'Aqua Palette',
              'visual-lab-button-palette visual-lab-button-aqua'
            )}
            ${buttonStateRow(
              'Dark Aqua Palette',
              'visual-lab-button-palette visual-lab-button-dark-aqua'
            )}
            ${buttonStateRow(
              'Light Blue Palette',
              'visual-lab-button-palette visual-lab-button-light-blue'
            )}
            ${buttonStateRow(
              'Blue Palette',
              'visual-lab-button-palette visual-lab-button-blue'
            )}
            ${buttonStateRow(
              'Dark Blue Palette',
              'visual-lab-button-palette visual-lab-button-dark-blue'
            )}
            ${buttonStateRow(
              'Light Purple Palette',
              'visual-lab-button-palette visual-lab-button-light-purple'
            )}
            ${buttonStateRow(
              'Purple Palette',
              'visual-lab-button-palette visual-lab-button-purple'
            )}
            ${buttonStateRow(
              'Dark Purple Palette',
              'visual-lab-button-palette visual-lab-button-dark-purple'
            )}
            ${buttonStateRow(
              'Light Plum Palette',
              'visual-lab-button-palette visual-lab-button-light-plum'
            )}
            ${buttonStateRow(
              'Plum Palette',
              'visual-lab-button-palette visual-lab-button-plum'
            )}
            ${buttonStateRow(
              'Dark Plum Palette',
              'visual-lab-button-palette visual-lab-button-dark-plum'
            )}
            ${buttonStateRow(
              'Light Pink Palette',
              'visual-lab-button-palette visual-lab-button-light-pink'
            )}
            ${buttonStateRow(
              'Pink Palette',
              'visual-lab-button-palette visual-lab-button-pink'
            )}
            ${buttonStateRow(
              'Dark Pink Palette',
              'visual-lab-button-palette visual-lab-button-dark-pink'
            )}
          </div>
        </section>
        <section class="visual-lab-button-section" data-palette-family="gradiant">
          <h2 class="visual-lab-button-section-title">Gradiant Palette Buttons</h2>
          <div class="visual-lab-button-grid">
            <div class="visual-lab-border-column-heading">Normal</div>
            <div class="visual-lab-border-column-heading">Dimmed</div>
            <div class="visual-lab-border-column-heading">Active</div>
            <div class="visual-lab-border-column-heading">Hover</div>
            ${gradiantButtonPaletteRows()}
          </div>
        </section>
        <section class="visual-lab-button-section" data-palette-family="metalic">
          <h2 class="visual-lab-button-section-title">Metalic Background &amp; Border</h2>
          <div class="visual-lab-button-grid">
            <div class="visual-lab-border-column-heading">Normal</div>
            <div class="visual-lab-border-column-heading">Dimmed</div>
            <div class="visual-lab-border-column-heading">Active</div>
            <div class="visual-lab-border-column-heading">Hover</div>
            ${metalicButtonPaletteRows()}
          </div>
        </section>
      </section>
    </main>
    ${paletteFilterScript}
    <script>
      (() => {
        const scrollKey = 'visual-lab-buttons-scroll-y';
        const scrollStorage = parent.sessionStorage;
        const savedPosition = Number(scrollStorage.getItem(scrollKey));
        let restoringScroll = true;
        const saveScrollPosition = () => {
          if (!restoringScroll) {
            scrollStorage.setItem(scrollKey, String(window.scrollY));
          }
        };
        const restoreScrollPosition = () => {
          if (Number.isFinite(savedPosition) && savedPosition > 0) {
            window.scrollTo(0, savedPosition);
          }
        };

        window.addEventListener('scroll', saveScrollPosition, { passive: true });
        window.addEventListener('pagehide', saveScrollPosition);
        window.addEventListener('beforeunload', saveScrollPosition);
        window.addEventListener('DOMContentLoaded', restoreScrollPosition);
        window.addEventListener('load', restoreScrollPosition);
        setTimeout(restoreScrollPosition, 100);
        setTimeout(restoreScrollPosition, 500);
        setTimeout(() => {
          restoreScrollPosition();
          restoringScroll = false;
        }, 750);
        restoreScrollPosition();
      })();
    </script>
  </body>
</html>`;

const bordersDocument = `<!doctype html>
<html lang="en" class="dark" data-theme-mode="dark" data-theme-palette="seerr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/visual-lab/visual-lab.css?v=palette-filters" />
  </head>
  <body class="visual-lab-canvas">
    <main class="app-shell relative min-h-screen p-4">
      <div class="app-backdrop pointer-events-none fixed inset-0 h-full w-full"></div>
      <section class="relative z-10 mx-auto w-full max-w-6xl space-y-8">
        <h1 class="page-title">Borders</h1>
        ${paletteFilterControls}
        <section class="visual-lab-border-section" data-palette-family="solid">
          <h2 class="page-heading">Solid Border</h2>
          <div class="visual-lab-border-grid">
            ${borderColumnHeadings}
            ${solidBorderCard('solid-steel')}
            ${solidBorderCard('solid-metalic-chrome')}
            ${solidBorderCard('solid-liquid-chrome')}
            ${solidBorderPaletteCards()}
          </div>
        </section>

        <section class="visual-lab-border-section" data-palette-family="gradiant">
          <h2 class="page-heading">Gradiant Border</h2>
          <div class="visual-lab-border-grid">
            ${borderColumnHeadings}
            ${gradiantBorderCard(styleDisplayName('gradiant-steel'), 'gradiant-steel')}
            ${gradiantBorderCard(styleDisplayName('gradiant-metalic-chrome'), 'gradiant-metalic-chrome')}
            ${gradiantBorderCard(styleDisplayName('gradiant-liquid-chrome'), 'gradiant-liquid-chrome')}
            ${gradiantBorderPaletteCards()}
          </div>
        </section>

        <section class="visual-lab-border-section" data-palette-family="metalic">
          <h2 class="page-heading">Metalic Border</h2>
          <div class="visual-lab-border-grid">
            ${borderColumnHeadings}
            ${borderCard(styleDisplayName('metalic-steel'), 'metalic-steel')}
            ${borderCard(styleDisplayName('metalic-chrome'), '', true)}
            ${borderCard(styleDisplayName('liquid-chrome'), 'liquid-chrome')}
            ${borderPaletteCards()}
          </div>
        </section>

        <section class="visual-lab-border-section" data-palette-family="metalic">
          <h2 class="page-heading">Metalic Border &amp; Background</h2>
          <div class="visual-lab-border-grid">
            ${borderColumnHeadings}
            ${borderCard(styleDisplayName('metalic-steel'), 'metalic-steel', false, true)}
            ${borderCard(styleDisplayName('metalic-chrome'), 'metalic-steel', true, true)}
            ${borderCard(styleDisplayName('liquid-chrome'), 'liquid-chrome', false, true)}
            ${borderPaletteCards(true)}
          </div>
        </section>
      </section>
    </main>
    ${paletteFilterScript}
    <script>
      (() => {
        const scrollKey = 'visual-lab-borders-scroll-y';
        const scrollStorage = parent.sessionStorage;
        const saveScrollPosition = () => {
          scrollStorage.setItem(scrollKey, String(window.scrollY));
        };
        const restoreScrollPosition = () => {
          const savedPosition = Number(scrollStorage.getItem(scrollKey));
          if (Number.isFinite(savedPosition) && savedPosition > 0) {
            window.scrollTo(0, savedPosition);
          }
        };

        window.addEventListener('scroll', saveScrollPosition, { passive: true });
        window.addEventListener('pagehide', saveScrollPosition);
        window.addEventListener('beforeunload', saveScrollPosition);
        window.addEventListener('DOMContentLoaded', restoreScrollPosition);
        window.addEventListener('load', restoreScrollPosition);
        setTimeout(restoreScrollPosition, 100);
        setTimeout(restoreScrollPosition, 500);
        restoreScrollPosition();
      })();
    </script>
  </body>
</html>`;

type VisualLabView = 'index' | 'title-text' | 'borders' | 'buttons';

interface VisualLabProps {
  view?: VisualLabView;
}

const VisualLab = ({ view = 'index' }: VisualLabProps) => {
  // All Visual Lab routes render through this component; guard here so its
  // alternate palette pages cannot accidentally omit the admin redirect.
  useRouteGuard(Permission.ADMIN);
  const intl = useIntl();
  const pageTitle =
    view === 'title-text'
      ? intl.formatMessage(messages.titleText)
      : view === 'borders'
        ? intl.formatMessage(messages.borders)
        : view === 'buttons'
          ? intl.formatMessage(messages.buttons)
          : intl.formatMessage(messages.title);
  const labels = Object.fromEntries(
    Object.entries(messages).map(([key, message]) => [
      key,
      intl.formatMessage(message),
    ])
  ) as Record<string, string>;
  labels.locale = intl.locale.replace(/_/g, '-');
  labels.direction = labels.locale.startsWith('ar') ? 'rtl' : 'ltr';
  const document =
    view === 'title-text'
      ? withDocumentLocale(
          withPaletteFilterControls(
            withDocumentTitle(titleTextDocument, pageTitle),
            labels
          ),
          intl.locale
        )
      : view === 'borders'
        ? withDocumentLocale(
            withPaletteFilterControls(
              withDocumentTitle(bordersDocument, pageTitle),
              labels
            ),
            intl.locale
          )
        : view === 'buttons'
          ? withDocumentLocale(
              withPaletteFilterControls(
                withDocumentTitle(buttonsDocument, pageTitle),
                labels
              ),
              intl.locale
            )
          : visualLabIndexDocument(labels);

  return (
    <>
      <PageTitle title={pageTitle} />
      <iframe
        title={pageTitle}
        srcDoc={document}
        className="h-[calc(100vh-5rem)] min-h-[32rem] w-full border-0"
      />
    </>
  );
};

export default VisualLab;
