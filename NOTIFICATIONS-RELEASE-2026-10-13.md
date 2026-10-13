# Web message notifications — 2026-10-13

## Scope and release baseline

User-authorized direct implementation, selective Git and Hosting/SSR release. No Rules, business Functions, credentials, system notification settings, historical messages or authorship changes. Physical Windows/Android PASS remains pending.

The current report is notification on own send, only the first incoming alert and delay. The older Windows Chrome-disabled diagnosis is historical, not an explanation of this new partial-delivery report.

Baseline reconciliation:

- Previous runtime `45bb9a9` was verified against live HTML, 33 JS/CSS files, 743 source files in sourcemaps and the actual public assets. Its static release marker was stale; the marker alone was not the baseline.
- Saved effective inbox cost behavior in `1c7bda5`: 120-second anonymous inbox recovery and hidden-tab suppression. Saved already-public assets and the SSR packaging gate in `8572708`.
- Current live release on resuming: `3d61b92`, marker builtAt `2026-10-13T05:32:16.280Z`. This cost release was based on older `c225ace` and omitted later already-live notifications/following/verified-link changes.
- Merged the released cost branch into this candidate in `f9cc622`. Its inbox source and SSR route were already identical; only the matching cost harness changed. Both release lineages are preserved. Unrelated MAIN `b89d2ca` is not included.

## Notification correction (`07cdc9c`)

- Stop consuming every message ID as historical on each detail snapshot; baseline only clearly old initial history.
- Classify notification direction using author/role evidence and exact local outbound IDs. Unknown metadata remains retryable. Ordinary profile-to-profile incoming messages are supported without changing unread/authorship policy.
- Keep message IDs through the detail alert path; allow web OS alerts even with the exact chat open, retaining native behavior.
- Re-alert new IDs within the same conversation (`renotify`), but deduplicate the same ID across page/push/tabs through the notification worker.
- Use the active worker without waiting for its network update; bound activation waits. A delayed acknowledgement never starts a competing duplicate display.

## Validation completed before release

TypeScript `tsc --noEmit`: exit 0. Fifteen scoped harnesses: exit 0.

New behavioral harnesses: `incoming-alert-repeat`, `incoming-notification-direction-20261012`, `web-notification-delivery-20261012`. Cover three consecutive messages, own-message suppression, role rotation, late metadata, initial history, same-text re-alert, page/push race, delayed ACK, worker restart/upgrade and nonblocking worker update.

Existing regression gates: `chat-own-notification-exact-read`, `chat-role-notif-author-read`, `chat-web-incoming-banners`, `chat-bidirectional-unread-sound`, `chat-notification-unique-ids`, `anon-direct-self-notification-rotation`, `fcm-registration`, `fcm-push-pipeline`, `anon-inbox-multi-thread`, `shuffle-live-visitors`, `shuffle-following-recovery-20261011`, `web-push-verified-refresh-20261011`.

These are local/worker-harness results, not physical OS popup verification. The release wrapper must also complete the production build and SSR packaging gates before upload. Deployment and public verification will be recorded separately after completion.

## Physical acceptance still required

After normal reload on each receiving browser: sending yourself must not show an incoming OS popup; receive three distinct consecutive messages in the same conversation and check all three, including while that chat is open. Check Windows Chrome and Android Chrome separately. Record observed latency; do not promise zero network/OS delay or infer PASS from a successful deploy.
