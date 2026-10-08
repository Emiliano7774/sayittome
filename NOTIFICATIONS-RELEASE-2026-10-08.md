# Web notifications: bounded release

## Source provenance

The previous live release is `8e28ce2`, built at `2026-10-08T03:12:51.966Z`.
Its successful deployment checkout is `C:/Users/emibe/sayittome-web-push-deploy2-139dc43`.
Required support files present in that deployed working tree but missing from Git
are now recorded byte-equivalently after CRLF normalization. See
`scripts/notification-release-baseline-20261008.json` for SHA-256 hashes.
Comparing all src/public/config sources against that checkout yields only the
notification changes below and the generated release marker. No speculative
reconstruction of abuse, moderation or historical records is included.

## Changes

- Notify on new inbound web messages even in the active conversation.
- Keep opted-in notification listeners active independently of the current page.
- Re-alert for distinct messages within one conversation, retaining one OS card
  per chat. The worker serializes push/page delivery and deduplicates message ids.
- Pass message ids from the detail listener to the shared delivery path.
- Bound worker activation wait; do not await a network update to use an active worker.
- Retry transient web registration failures with bounded backoff, focus/online
  recovery and cleanup; verify registration belongs to the current auth uid.
- Preserve native active-thread suppression and existing FCM installation proof,
  auth ownership, pending-unregister and sender/recipient classification logic.

## Verification before deployment

- PASS: production build, TypeScript, 34 generated pages, SSR firebase-admin zero-hash gate.
- PASS: web-notification-delivery (real worker evaluated with synthetic events,
  push/page concurrency, equal text with distinct ids, retry after display failure,
  worker restart, route policy, active web/native policy and bounded registration retries).
- PASS: fcm-registration, fcm-push-pipeline, chat-notification-unique-ids,
  anon-inbox-multi-thread, chat-bidirectional-unread-sound.
- Existing P0 profile-anon-abuse-scope assertion on `profileAnonAbuseBlock` also
  fails in the exact deployed checkout. It is not fixed or represented as PASS.
  Firestore/Storage Rules, auth secrets, business Functions and historical data
  remain untouched. Deploy scope is Hosting and its framework-managed SSR only.

## Physical verification is still separate

The user's normal Chrome profile shows site permission granted and an active FCM
registration in SayItToMe. Read-only Windows inspection found
`HKCU/Software/Microsoft/Windows/CurrentVersion/Notifications/Settings/Chrome`
with `Enabled = 0`, while global `ToastEnabled = 1`. No system setting was changed.
Windows Chrome notifications must be enabled by the user before physical toast
delivery can receive user PASS. Automated tests are not that PASS.

After release: verify both `/api/build-sha` and `/build-release.json`, then test
two incoming messages in the same open chat, another app section, and background
browser. Verify one alert per message and correct chat opening on notification click.
