const route = '/api/v1/settings/readarr';
const service = {
  id: 11,
  name: 'Combined Bookshelf',
  serviceType: 'ebook',
  hostname: 'bookshelf.local',
  port: 8787,
  apiKey: '[REDACTED]',
};

const authors = Array.from({ length: 103 }, (_, index) => ({
  id: index + 1,
  name: `Author ${String(index + 1).padStart(3, '0')}`,
  path: '/media/books',
  currentFormatPath: `/media/ebooks/Author ${String(index + 1).padStart(3, '0')}`,
  bookFileCount: index === 0 ? 2 : 1,
}));

const configuration = {
  serviceId: 11,
  serviceName: 'Combined Bookshelf',
  configuredFormat: 'ebook',
  format: 'ebook',
  truncated: false,
  authors,
  rootFolders: [
    { id: 1, path: '/media/new-books', accessible: true },
    { id: 2, path: '/media/locked', accessible: false },
  ],
};

const preview = {
  format: 'ebook',
  destinationRootPath: '/media/new-books',
  previewToken: 'fresh-preview-token',
  authorCount: 1,
  mediaFileCount: 1,
  sidecarFileCount: 1,
  missingFileCount: 0,
  totalSize: 512,
  requiredCopyBytes: 512,
  availableSpace: 1024 * 1024,
  canMove: true,
  warnings: [],
  conflicts: [],
  authors: [
    {
      authorId: 1,
      authorName: 'Author 001',
      format: 'ebook',
      sourcePath: '/media/ebooks/Author 001',
      destinationPath: '/media/new-books/Author 001',
      mediaFileCount: 1,
      sidecarFileCount: 1,
      missingFileCount: 0,
      alreadyAtDestinationCount: 0,
      totalSize: 512,
      requiredCopyBytes: 512,
      availableSpace: 1024 * 1024,
      canMove: true,
      warnings: [],
      conflicts: [],
      files: [
        {
          fileType: 'media',
          sourcePath: '/media/ebooks/Author 001/book.epub',
          destinationPath: '/media/new-books/Author 001/book.epub',
          status: 'ready',
          sourceExists: true,
          destinationExists: false,
          size: 512,
        },
      ],
    },
  ],
};

describe('Bookshelf media path migration', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.intercept('GET', route, [service]).as('bookshelfServices');
    cy.intercept(
      'GET',
      `${route}/11/media-move/configuration*`,
      configuration
    ).as('bookshelfLibrary');
  });

  it('paginates the author list and requires review before queueing a move', () => {
    let statusPolls = 0;
    cy.intercept('POST', `${route}/11/media-move/preview`, (req) => {
      expect(req.body).to.deep.equal({
        authorIds: [1],
        format: 'ebook',
        destinationRootPath: '/media/new-books',
      });
      req.reply({ body: preview });
    }).as('previewMove');
    cy.intercept('POST', `${route}/11/media-move/start`, (req) => {
      expect(req.body.previewToken).to.equal('fresh-preview-token');
      req.reply({ statusCode: 202, body: { command: { id: 91 } } });
    }).as('startMove');
    cy.intercept('GET', `${route}/11/media-move/commands/91`, (req) => {
      statusPolls += 1;
      req.reply({
        command: {
          id: 91,
          name: 'MoveAuthorMediaBatch',
          status: statusPolls < 2 ? 'started' : 'completed',
          progress: statusPolls < 2 ? 25 : 100,
        },
      });
    }).as('moveStatus');

    cy.visit('/settings/library-migration');
    cy.wait('@bookshelfLibrary');
    cy.contains('a', 'Read the Bookshelf migration guide')
      .should('have.attr', 'href')
      .and(
        'eq',
        'https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/bookshelf-media-path-migration.md'
      );
    cy.contains('span', 'Page 1 of 2').should('be.visible');
    cy.get('button[aria-label="Select Author 101"]').should('not.exist');
    cy.contains('button', 'Next page').click();
    cy.get('button[aria-label="Select Author 101"]').should('be.visible');
    cy.contains('button', 'Previous page').click();

    cy.get('button[aria-label="Select Author 001"]').click();
    cy.contains('label', 'Destination root folder')
      .find('select')
      .select('/media/new-books');
    cy.contains('button', 'Preview move').click();
    cy.wait('@previewMove');
    cy.contains('Move preview').should('be.visible');
    cy.contains('1 media files').should('be.visible');
    cy.contains('summary', 'Review authors and destination paths').click();
    cy.contains('summary', 'Author 001').click();
    cy.contains('/media/ebooks/Author 001/book.epub').should('be.visible');
    cy.get(
      'button[aria-label="I reviewed this preview and want BookshelfNG to move these files."]'
    ).click();
    cy.contains('button', 'Start move').click();
    cy.wait('@startMove');
    cy.contains('BookshelfNG completed the media move.', {
      timeout: 10000,
    }).should('be.visible');
    cy.get('@moveStatus.all').should('have.length.at.least', 2);
  });

  it('blocks starting a conflicted preview and explains consolidation scope', () => {
    cy.intercept('POST', `${route}/11/media-move/preview`, {
      body: {
        ...preview,
        canMove: false,
        conflicts: ['/media/new-books/Author 001/book.epub already exists'],
      },
    });
    cy.intercept('POST', `${route}/11/media-move/start`).as('startMove');
    cy.visit('/settings/library-migration');
    cy.contains(
      'This page does not copy files or database records between separate BookshelfNG instances.'
    ).should('be.visible');
    cy.get('button[aria-label="Select Author 001"]').click();
    cy.contains('label', 'Destination root folder')
      .find('select')
      .select('/media/new-books');
    cy.contains('button', 'Preview move').click();
    cy.contains('Conflicts').should('be.visible');
    cy.contains('/media/new-books/Author 001/book.epub already exists').should(
      'be.visible'
    );
    cy.contains('button', 'Start move').should('not.exist');
    cy.get('@startMove.all').should('have.length', 0);
  });

  it('hides the path-migration page from non-admin users', () => {
    cy.loginAsUser();
    cy.visit('/settings/library-migration');
    cy.location('pathname').should('not.eq', '/settings/library-migration');
  });
});
