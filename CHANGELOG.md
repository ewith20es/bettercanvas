# Better Canvas changelog

Newest entries first. Record what changed, why, verification, and unfinished work.
Older entries below were reconstructed from Git history and session records; they
are not claims of fresh testing. Current context lives in [PROJECT.md](PROJECT.md).

## 2026-10-03 — Use the current MCPS StudentVUE mobile API

- Replaced the app's rejected SOAP/relay connection with direct MCPS
  `/api/v1/mobile/PXPWebServices/AttemptLogin` student authentication and bearer-token
  `Gradebook` requests. Removed relay configuration from the app and Render setup.
  Kept the browser-session beta and historical SOAP/Worker code/tests available.
- Added a bounded mobile JSON parser for periods, course marks and assignment
  scores. Reported grades remain unchanged; percentages are distinct from earned
  points, zero scores remain zero, and unknown weights/totals remain unknown.
  The modern bell-schedule contract is not established, so the countdown stays hidden.
- Renew expired bearer tokens once; fixed-origin requests reject redirects, sanitize
  errors, and clear/abort credentials and tokens on disposal. Authentication-service
  outages do not erase saved passwords. Disconnect/logout during schedule loading
  can no longer recreate a remembered sign-in.
- Restored the absent designated worktree from the remote Claude branch at `d5afa1c`
  and corrected the local path in PROJECT.md. Outer main was not switched or merged.
- New protocol evidence: public gradebook-mcp mobile client/parser; MCPS anonymous
  student-envelope POST returns 401 and GET returns 405. No real or invented account
  credentials used. Endpoint availability does not verify a live student login.
- Verification: **172 tests passed**, typecheck and production build passed.
  Production deployment has not been verified. Real-account MCPS authentication
  and live payload compatibility still need verification inside the protected app.

## 2026-10-01 — Past-due Missing and submitted-in-person marks

- Past-due work without a submission or grade now shows Missing, including paper,
  external-tool and unknown submission statuses. Canvas missing flags stay distinct
  from inferred deadlines; excused and already submitted/graded work are not inferred missing.
- Added reversible checkmarks on rows and in details for Submitted in person.
  Stored in per-account browser preferences; no Canvas writes or invented timestamps.
  Missing counts, Home attention, course counts, badges and Submitted filtering
  respect the personal mark. Undo from Submitted/All restores the Canvas-derived status.
- Verification: 136 tests passed, including new inference/override cases; typecheck
  and production build passed. Local changes only, not deployed.

## 2026-09-28 — Assignment date groups and tab sorting

- Upcoming now groups assignments by due date in the selected timezone, with full
  date headings, Today/Tomorrow labels, counts, and horizontal dividers.
- Submitted, Graded, and Hidden default to latest due date first; other tabs default
  to earliest first. Switching tabs resets the sort to that tab's default. Explicit
  sort choices still work; Upcoming name/course sorting operates within each date.
- Clear filters retains the current tab and restores its default sort.
- Typecheck and production build passed. Changes saved locally, not deployed.

## 2026-09-25 — Canvas key expiration reminder

- Added a days-left reminder directly above the desktop sidebar profile and in
  Settings → Canvas connection, including a date editor for mobile.
- Initial expiration: December 10, 2026 at 12 AM America/New_York. Counts calendar
  days in that timezone, warns at seven days, and shows Replacement due at expiration.
- Dates save with existing per-account browser preferences; they do not sync across
  devices or change/check the real token. Settings explain replacing
  `CANVAS_ACCESS_TOKEN` in Render with Save and deploy, then updating the date.
- Verification: 134 tests passed, including midnight Eastern and DST cases;
  typecheck and production build passed. Saved locally; not deployed.

## 2026-09-25 — Durable project context

- Added shared CLAUDE.md working rules, an AGENTS.md entry point, PROJECT.md current
  state, and this changelog, following SkateScout's documentation structure.
- Added docs/STUDENTVUE.md to preserve connection research, failed approaches,
  user requirements, and the distinction between deployed parser fixes and unfinished login.
- Added pointers in the outer checkout so future sessions find the active Claude worktree.
- Documentation only; no application behavior changed or new application test run.
  These notes do not represent a new deployment.

## 2026-09-25 — Request the StudentVUE assignment view (`b496986`)

- Fixed rejection of courses whose portal opening tab is posts or rich content.
  Always request the fixed assignment-details control and assignment view.
- Added four synthetic regression cases; full suite 130 passing, typecheck/build passed.
- Verified Render deployed this commit. Full live-account grade loading after the
  fix remains unconfirmed. Automatic ID/password-to-web-session login is unfinished.
- Inspected MangoGrade's public login flow; the upstream MCPS login remains private.
  User confirmed their MCPS ID/password works in MangoGrade; preserve that evidence.

## 2026-09-25 — Browser-session connection beta (`0734a46`)

- Added protected manual MCPS session-cookie connection and PXP2 gradebook parsing.
  Credentials remain in a separate in-memory jar with bounded read-only requests.
- Supports course percentages and assignment scores, not category totals/weights or
  period dates. Deployed beta; synthetic testing does not prove live-account compatibility.
- Manual cookie entry is temporary and does not satisfy automatic login on school devices.

## 2026-09-24 — Owner relay transport (`150b86f`)

- Fixed Cloudflare redirect handling and separated relay failures from MCPS rejection.
- Worker reaches MCPS, which returns UPD5304. A healthy relay is not a successful login.

## Earlier milestones — reconstructed from Git

- **2026-09-23:** Relay follow-up (`82050ca`).
- **2026-09-21:** Shared gradebook topbar/sidebar (`9df76bd`), grading-period countdowns
  and disconnect placement (`32c474a`), remembered-login/sidebar fixes (`31fc9c8`, `9686711`).
- **2026-09-20:** Grade Melon theme/colors (`10a597e`, `63d37f1`); GradeDurian-inspired
  layout, countdown and multi-assignment what-if (`66b7786`). Earlier proxy integration
  (`4d59d75`) is historical; the third-party proxy is no longer the intended dependency.
- **2026-09-19:** StudentVUE gradebook introduced (`1f064ef`) and connection follow-up (`600331f`).
- **2026-09-12:** Combined missing/overdue (`e3a697e`), new logo (`b2ef989`), hidden assignments (`e71db60`).
- **2026-09-11:** Course organization (`ca14fe9`), initial deploy work (`f94267e`),
  minimum app password length 8 (`ee3bcaa`), initial implementation (`d6041f2`).
  [Original verification](docs/VERIFICATION.md) records that day's 21-test baseline,
  not the current test count or deployment status.
