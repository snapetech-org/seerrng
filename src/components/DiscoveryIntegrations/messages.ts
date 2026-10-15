import defineMessages from '@app/utils/defineMessages';
export default defineMessages('discovery', {
  'accounts.title': 'Discovery Accounts',
  'accounts.description':
    'Connect personal accounts for recommendations and lists. These connections do not grant access to sign in to SeerrNG.',
  'accounts.failed':
    'The account operation failed. Check the provider connection and try again.',
  'accounts.expired':
    'Authorization expired or was declined. Start a new connection.',
  'accounts.disconnected': 'Not connected',
  'accounts.unconfigured': 'Administrator setup required',
  'accounts.disconnect': 'Disconnect',
  'accounts.allowwrites':
    'Allow SeerrNG to make tracking changes to my {provider} account',
  'accounts.writesdescription':
    'Only changes you choose in My Library are sent. Turn this off to keep this connection read-only.',
  'accounts.connect': 'Connect',
  'accounts.authorize': 'Authorize SeerrNG on {provider}.',
  'accounts.open': 'Open authorization page',
  'accounts.code': 'Authorization code',
  'accounts.complete': 'Complete connection',
  'accounts.cancel': 'Cancel',
  'configuration.title': 'Discovery Integrations',
  'configuration.description':
    'Configure provider applications here. Users connect their own accounts under Linked Accounts. Saved secrets are hidden; leave a field unchanged to retain its value.',
  'configuration.failed':
    'Integration settings could not be saved or loaded. Try again.',
  'configuration.saved': 'Integration settings saved.',
  'configuration.configured': 'Configured',
  'configuration.unconfigured': 'Not configured',
  'configuration.clientid': 'Client ID',
  'configuration.clientsecret': 'Client secret',
  'configuration.apikey': 'API key',
  'configuration.clear': 'Clear this integration',
  'configuration.save': 'Save integration settings',
  'providers.title': 'Provider Discovery',
  'providers.traktWatchlist': 'Trakt watchlist',
  'providers.traktHistory': 'Trakt history',
  'providers.traktMovieRecommendations': 'Trakt movie recommendations',
  'providers.traktSeriesRecommendations': 'Trakt series recommendations',
  'providers.anilistTrending': 'AniList trending anime',
  'providers.anilistPopular': 'AniList popular anime',
  'providers.anilistTop': 'AniList top anime',
  'providers.anilistNextSeason': 'AniList next season',
  'providers.anilistLibrary': 'Your AniList library',
  'providers.mdblistPublicList': 'MDBList public list',
  'providers.description':
    'Browse personal recommendations, anime catalogs, and curated lists.',
  'providers.manage': 'Manage connected accounts',
  'providers.feed': 'Discovery feed',
  'providers.list': 'MDBList URL or list ID',
  'providers.browse': 'Browse list',
  'providers.failed':
    'This feed could not be loaded because the provider is temporarily unavailable.',
  'providers.rateLimited':
    'The provider request limit was reached. Retry in {seconds}s.',
  'providers.reconnectRequired':
    'Your provider account needs to be reconnected before this feed can load.',
  'providers.setupRequired':
    'MDBList is not configured. Ask an administrator to add its API key in Settings → Discovery Integrations.',
  'providers.listNotFound':
    'MDBList could not find that list. Check the URL or ID and make sure the list is public.',
  'providers.reconnectAction': 'Manage linked accounts',
  'providers.retry': 'Retry',
  'providers.loading': 'Loading discovery feed…',
  'providers.empty': 'No titles on this page.',
  'providers.unmapped':
    'Some titles do not have a confirmed catalog match yet. They are shown with their original provider information.',
  'providers.matchpending': 'Catalog match pending',
  'providers.repairOnly': 'Show unmatched titles on this page ({count})',
  'providers.noUnmatched': 'No unmatched titles remain on this page.',
  'providers.noStableIdentity':
    'This item has no stable provider ID, so its match cannot be saved.',
  'providers.previous': 'Previous',
  'providers.page': 'Page {page}',
  'providers.next': 'Next',
  'providers.explore': 'Explore provider recommendations and lists',
  'personalized.title': 'Picked for You',
  'personalized.traktMovies': 'Recommended Movies from Trakt',
  'personalized.traktSeries': 'Recommended Series from Trakt',
  'personalized.traktWatchlist': 'Your Trakt Watchlist',
  'personalized.anilistWatching': 'Continue Watching on AniList',
  'personalized.anilistPlanning': 'Planned Anime on AniList',
  'personalized.simklWatching': 'Continue Watching on Simkl',
  'personalized.simklPlanning': 'Your Simkl Watchlist',
  'personalized.failed': 'Your personalized provider rows could not load.',
  'personalized.rowFailed':
    'This {provider} row could not load because the provider is temporarily unavailable.',
  'personalized.rateLimited':
    'The provider request limit was reached. Retry in {seconds}s.',
  'personalized.reconnectRequired':
    'Reconnect this provider account to load the row.',
  'personalized.retry': 'Retry',
  'personalized.manage': 'Manage connected accounts',
});
