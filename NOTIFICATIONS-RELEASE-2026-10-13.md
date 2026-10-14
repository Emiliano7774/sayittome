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

These are local/worker-harness results, not physical OS popup verification.

## First publication and subsequent replacement

Hosting/SSR `0e13dce` completed successfully in 627 seconds, exit 0, after both production builds and the packaged SSR zero-hash gate passed. BuiltAt `2026-10-13T13:16:33.638Z`. No business Functions or Rules were deployed.

On resuming at `2026-10-13T18:28:06Z`, both public markers instead showed `6766bf8`, builtAt `2026-10-13T15:23:09.886Z`. That later publication includes additional admin review/media and view-once work but does not descend from the notification release. The completed first deploy is therefore not evidence that this notification correction remains live.

Reconciliation with `6766bf8` completed in merge `2338eb5`, retaining its already-published admin/view-once work. The initial exclusion of unrelated `b89d2ca` above describes the first release; it now belongs to the verified newer baseline.

Independent read-only proof: `/`, `/admin`, `/shuffle` and all 35 referenced JS/CSS files are byte-identical to MAIN's packaged release. All 745 project source files recovered from 446 packaged sourcemaps match current MAIN after BOM/CRLF normalization. This also proves four uncommitted admin cost reductions were actually live; they are saved here as baseline, not inferred from dirty MAIN:

- `src/app/admin/page.tsx`: normalized SHA256 `1988dfccc46447ad3982a910a213be4c8c66a1845ea7318a997c02e4933b1867`.
- `src/components/admin/AdminGenderRatioPanel.tsx`: `0e423364ec6980f4cca0c31e439acf3c5a53842d6f30d526cabe1929b9902b43`.
- `src/components/admin/AdminRegistrationsPanel.tsx`: `451fd6776f9a53e91dc7f08ca4a4f35adcc7f717d93a02a40cc9cff4cb17fb3c`.
- `src/hooks/useClassicModerationFeed.ts`: `2df135ba2b6a360e9c42615f932ff272ed88cbd6e91bdce39b6f4e79c8c2cc6f`.

The already-preserved 120-second inbox file matches live too. Restored admin/media/view-once harnesses pass after recompiling their local Functions test dependency; that compilation is not a Functions deployment. Nineteen regression harnesses and TypeScript pass after reconciliation. The effective source delta against verified current production is only the notification correction.

## Final publication verified

Hosting/SSR release `cc051c7`, builtAt `2026-10-13T18:31:53.141Z`, completed exit 0 in 514 seconds. Both production builds and packaged SSR zero-hash gates passed. No business Functions or Rules were deployed.

Public proof at `2026-10-14T01:07:23.637Z` (13/10, 22:07 ART): 44/44 checks passed. Runtime API and static release marker both show `cc051c7`; `/`, `/shuffle`, `/admin`, all 35 referenced JS/CSS, the notification worker and ads.txt are byte-equal to the verified package/source. Unauthenticated admin/anonymous-incoming calls return 401; the admin response is private/no-store. These negative checks are not authenticated functional tests. Full hashes: `scripts/notification-production-proof-20261013.json`.

To prevent another later MAIN-based release dropping the correction, the exact notification commit was also cherry-picked as `8152a0c` onto active `p0/abuse-checkpoint` and pushed. Its 14 target files and the index had no pre-existing changes; unrelated dirty work was preserved. MAIN was not used for deployment. The three notification harnesses were rerun there with PASS.

## Physical acceptance still required

After normal reload on each receiving browser: sending yourself must not show an incoming OS popup; receive three distinct consecutive messages in the same conversation and check all three, including while that chat is open. Check Windows Chrome and Android Chrome separately. Record observed latency; do not promise zero network/OS delay or infer PASS from a successful deploy.
