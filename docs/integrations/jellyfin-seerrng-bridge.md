# Jellyfin sign-in bridge

The SeerrNG Jellyfin Bridge is an optional Jellyfin plugin for operators who
run SeerrNG separately from Jellyfin. It adds a SeerrNG shortcut to Jellyfin's
administrator dashboard and exchanges the current Jellyfin session for a
normal SeerrNG session. It does not install, host, or bundle SeerrNG inside
Jellyfin.

## Setup

1. Configure the Jellyfin server in SeerrNG and link each intended user's
   Jellyfin account from **Profile → Settings → Linked Accounts**.
2. Set Jellyfin as SeerrNG's active media server, enable media-server sign-in,
   then turn on **Enable SeerrNG sign-in from Jellyfin** in **Settings → Jellyfin**.
3. Install the [SeerrNG Jellyfin Bridge plugin](https://github.com/snapetech-org/seerrng/tree/main/integrations/jellyfin-plugin)
   and enter the SeerrNG URL in its Jellyfin settings page. Include a reverse
   proxy path prefix when SeerrNG is served below a subpath. Set the same
   public URL as SeerrNG's application URL so the post-login redirect keeps
   that prefix.
4. A Jellyfin administrator selects **SeerrNG** from the Jellyfin dashboard
   and chooses **Continue to SeerrNG**. Jellyfin exposes plugin pages in its
   administrator dashboard; regular users should open SeerrNG directly and use
   its configured Jellyfin sign-in.

The bridge uses the access token already held by the signed-in Jellyfin Web
client. The plugin submits it in the POST body; SeerrNG validates it live with
the configured Jellyfin server, verifies that server identity, and looks up an
existing linked SeerrNG account. It never provisions a new SeerrNG account or
changes the linked identity. Tokens are not put in a URL or persisted by the
bridge.

Bridge-created SeerrNG sessions carry the Jellyfin user and configuration
authority that established them. Disabling the bridge invalidates existing
bridge sessions, and turning it back on does not restore them. SeerrNG also
rejects a session after Jellyfin settings change or the user unlinks or changes
the Jellyfin account. The user's normal Jellyfin login continues to work.

Use HTTPS for the SeerrNG URL. HTTP requests are accepted only if the SeerrNG
operator explicitly enabled HTTP authentication.
