# SeerrNG Jellyfin Bridge

This optional Jellyfin plugin adds a SeerrNG shortcut to Jellyfin's
administrator dashboard. It connects to a separately deployed SeerrNG server;
it does not bundle or host SeerrNG inside Jellyfin.

The plugin sends the current Jellyfin user's access token in a POST body.
SeerrNG validates that token against the configured Jellyfin server and only
signs in an account that is already linked by Jellyfin user ID. Tokens are not
put in URLs or saved by the plugin or SeerrNG. SeerrNG sessions created this way
are revoked when an administrator disables the bridge, changes the Jellyfin
connection settings, or the user unlinks the Jellyfin account.

## Configure

1. Configure the Jellyfin server in SeerrNG and link each user's Jellyfin
   account in SeerrNG profile settings.
2. Set Jellyfin as SeerrNG's active media server, enable media-server sign-in,
   then enable **SeerrNG sign-in from Jellyfin** in **Settings → Jellyfin**.
3. Install this plugin in Jellyfin and enter the SeerrNG URL on the plugin's
   settings page. Keep a reverse-proxy path prefix if the app uses one.
4. A Jellyfin administrator opens **SeerrNG** from the Jellyfin dashboard and
   chooses **Continue to SeerrNG**. Jellyfin exposes plugin pages in its
   administrator dashboard; regular users should open SeerrNG directly and use
   its configured Jellyfin sign-in.

Use HTTPS for SeerrNG. Direct HTTP is accepted only when the SeerrNG operator
has explicitly enabled HTTP authentication.

## Build and install from source

This plugin targets the Jellyfin 10.11 ABI on .NET 9 and builds against the
current Jellyfin 10.11.11 SDK. Once a SeerrNG release includes the plugin
archive, add this repository in Jellyfin's **Dashboard → Plugins → Repositories**:

`https://github.com/snapetech-org/seerrng/releases/latest/download/seerrng-jellyfin-plugin-manifest.json`

For a source build, run:

```sh
dotnet publish integrations/jellyfin-plugin/SeerrNG.JellyfinBridge.csproj \
  --configuration Release --output ./artifacts/seerrng-jellyfin-bridge
```

Copy `Jellyfin.Plugin.SeerrNGBridge.dll` into a folder named `SeerrNG Bridge`
under Jellyfin's plugin directory, then restart Jellyfin. The plugin is
independent of the SeerrNG application package.
