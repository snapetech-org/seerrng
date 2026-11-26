Podcast feeds are now read by SeerrNG itself, over a connection pinned to a
public address, instead of asking Audiobookshelf to fetch a URL SeerrNG had only
checked with its own resolver. A feed name that resolves to a public address
when checked and a private one when fetched (DNS rebinding) is refused. New
shows keep the feed address that was checked, and covers or episodes on private
hosts are not passed to Audiobookshelf.
