Podcast routes now apply follower visibility to direct show, episode, artwork,
and queue lookups. A linked user cannot retrieve another account's followed
show by guessing or obtaining its Audiobookshelf item ID. Episode played state
now reflects the linked user's own listening progress.

Audiobookshelf identity lookup errors, ambiguous account matches, and malformed
user lists now fail closed, so an upstream account-list failure cannot expose
private followed shows as though the viewer were unlinked.
