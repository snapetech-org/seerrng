# Arabic URL protocol prefix review

PR #418 was open at source head `21d245b742443832fe13aa0a8729fca730329369` when this review began. The browser review used that source plus a narrowly scoped LTR isolate around the Jellyfin protocol text in `src/components/Setup/JellyfinSetup.tsx`.

## Route and state

- Route: `/setup`; choose Arabic in the display-language picker, then choose **Configure Jellyfin**.
- Viewport: 1440 × 1000 desktop.
- The page was scrolled to the Jellyfin credential form. No fields were filled, no login was submitted, and no transport setting was saved.
- The route rendered in an isolated headed Chrome session with no saved login state. The public setup flow required no authentication.

## Finding

Before the fix, the page's RTL direction reordered the literal protocol prefix as `://http`. The hostname input already had `dir="ltr"`; the adjacent prefix span inherited RTL. Wrapping only the protocol text in `<bdi dir="ltr">` renders `http://` in normal order while keeping the styled wrapper's RTL geometry. No translation or form value changed.

The before and after captures show the same Arabic setup state at the same viewport. Background artwork changes between loads; the comparison concerns the protocol text at the right edge of the hostname field.

| State | Capture | SHA-256 |
| --- | --- | --- |
| Before the fix | [before-ar-jellyfin-form-1440x1000.png](before-ar-jellyfin-form-1440x1000.png) | `bed80262fcf758341944a31853ad13552b8c3c995854df2de11183dfd975ab84` |
| After the fix | [after-ar-jellyfin-form-1440x1000.png](after-ar-jellyfin-form-1440x1000.png) | `b65ba3d679e42302e1a0a083cbfcab3c8f0d41141b6462ccb18d16b2f0a9a3fe` |

## Scope and limits

- The modified UI control and Arabic `/setup` state were inspected visually at the recorded desktop viewport.
- No narrow/mobile viewport review was performed. Authenticated pages and live media-server connectivity were not reviewed.
- No tests, production builds, or CI jobs were run for this visual check.
