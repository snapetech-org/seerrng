describe('Prowlarr settings search', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.request('/api/v1/auth/me').then(({ body }) =>
      cy.request('POST', `/api/v1/user/${body.id}/settings/interface-theme`, {
        theme: 'seerrNGJ',
      })
    );
  });

  it('finds the Prowlarr settings when searching for NZBHydra2 and explains the supported provider', () => {
    cy.visit('/settings/services');
    cy.get('input[aria-label="Search Settings"]').type('NZBHydra2{enter}');

    cy.location('pathname').should('eq', '/settings/prowlarr');
    cy.contains(
      'This setting connects to Prowlarr only. NZBHydra2 is not currently supported here.'
    ).should('be.visible');
  });
});
