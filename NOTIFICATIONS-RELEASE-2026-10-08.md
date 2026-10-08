# Web notifications: bounded release

## Published and independently fetched from production

Source `d1afeb3` deployed successfully in 455 seconds (exit 0), built at
`2026-10-08T19:36:28.937Z`. At `2026-10-08T19:44:33.935Z`, independent HTTP
fetches verified both `/api/build-sha` and `/build-release.json` report `d1afeb3`.
The static marker contains the expected build timestamp; the API's optional
`builtAt` is empty and is not used as timestamp evidence.

Live root HTML, all 30 referenced JS/CSS assets, custom notification worker and
ads.txt match the packaged/local release byte-for-byte. The worker includes the
new shared delivery/deduplication and renotify path. Unauthenticated read-only
requests to admin P0 configuration and anonymous-match incoming endpoints return
401; admin response is private/no-store. These are bounded smoke checks, not a
complete security audit. Evidence: `scripts/notification-production-proof-20261008.json`.

All six notification-focused harnesses passed again on the reconciled source.
No synthetic production messages were sent. Windows Chrome `Enabled=0` was
rechecked before completion; the system setting remains untouched. User physical
PASS is still pending after enabling Chrome in Windows notification settings.

## Later live release reconciled before final publication

The first notification deploy `58123bd` completed (608 seconds, exit 0), then a
later deployment replaced it with effective MAIN `1b5447b`, built at
`2026-10-08T09:05:41.087Z`. Do not redeploy the older snapshot over that release.
Read-only independent inspection confirmed live HTML and 30 JS/CSS assets match
the latest MAIN generated package; 710 src files match its embedded sourcemaps
(704 exact, 6 differing only by compiler-stripped BOM). All 33 public assets match
live as well. Current effective runtime sources/configuration are preserved in
this isolated checkout, including recentUnreadHint/no-premature-burn chat fixes,
cost reductions, navigation recovery, privacy/cache headers and manifest wait.
The three already-live AAB downloads are preserved byte-identically as existing
release assets, not rebuilt Android releases. See
`scripts/notification-live-reconcile-20261008.json` for hashes and bounded delta.
The final effective runtime delta against that live release remains notification
code only. Main checkout, Rules, business Functions and historical data are untouched.

Reconciled build/TypeScript and web-notification-delivery/fcm-registration PASS.
The older P0 assertion below is historical evidence of the earlier baseline, not
a new certification or regression claim about this reconciled release.

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
