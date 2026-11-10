Windows release archives now use a hoisted production dependency layout to avoid
duplicating pnpm dependency links in ZIP files. Dependency JavaScript source maps
and test screenshot fixtures are omitted, while runtime libraries and application
assets remain included. Windows ZIPs use maximum Deflate compression and must fit
a 190,000,000-byte budget before checksums and publication. Chocolatey submission
also checks the downloaded payload, including retries against older releases.
