# Lumen Plex PIN cancellation

Source review of contribution #458 found a cancellation race in `lumen/src/auth.tsx`:
the poll checked for an authentication token before checking whether the user had
closed Plex. An in-flight response could therefore exchange its token after the
user cancelled. A production-browser baseline reproduced one unwanted
`POST /api/v1/auth/plex` after the popup closed.

The flow now checks popup closure both before polling and after the response,
before exchanging any token. It retains the existing sign-in, opener isolation,
error message and five-minute polling window.

The built frontend passes all 24 browser checks on desktop, iPhone, Android and
tablet Chromium viewports, including cancellation and approval in all four.
The existing ten real-nginx/native-Plex-link checks also pass. Eight focused
cases capture before/after sign-in screens, verify no horizontal overflow, and
confirm that cancelled attempts submit zero tokens while approved attempts
submit exactly one. Four matching viewport captures were visually inspected;
the established login form and cancellation message fit the viewport.

Evidence is retained in the contribution-recovery task deliverables:
`lumen-pin-cancel-baseline-direct.log`, `lumen-pin-accepted-browser.log`,
`lumen-pin-accepted-node.log`, `lumen-pin-visual/`, and
`lumen-pin-cancellation-visual-review.jpg`.

The positive-case harness initially required the remote popup to close itself.
Chromium rejects that operation after its opener is cleared; the trace records
that browser limitation. Positive acceptance instead checks the actual token
exchange and error state. Automatic closure of the remote Plex window is not
claimed. PIN HTTP requests remain subject to the existing fetch behavior; this
repair does not claim a new per-request timeout, live Plex approval, or physical
mobile testing.

Hosted CI initially passed 23 cases but failed a pre-login Android screenshot:
the capture had not awaited the asynchronous authenticated-state check or the
login form. Captures now wait for the actual Plex button and focus their own page.
Sixteen repeated focused cases pass with all captures retained; the cancellation
and token-exchange assertions are unchanged. Hosted revalidation is pending.
