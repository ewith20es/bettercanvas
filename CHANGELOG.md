# Better Canvas changelog

Newest entries first. Record what changed, why, verification, and unfinished work.
Older entries below were reconstructed from Git history and session records; they
are not claims of fresh testing. Current context lives in [PROJECT.md](PROJECT.md).

## 2026-10-22 — Expand backup school bell schedules

- Added Wootton, Churchill and Poolesville high schools, plus Frost, Cabin John,
  Hoover and North Bethesda middle schools, grouped in the fallback dropdown.
- Transcribed regular, early-release and two-hour-delay times from each school's
  officially linked document. Wootton also has advisory/pep rally; Churchill has
  PRIDE, town hall and pep rally; Poolesville has Wednesday/advisory.
- Added a saved grade 6/7/8 choice for middle schools. Each grade uses its own
  lunch gaps and numbered classes; unnumbered advisory/lunch blocks are not mapped
  to an invented course period. Special schedule overrides still expire daily,
  retaining grade level and returning middle schools to their regular schedule.
- Poolesville's current site links a document labeled 2023–24: an explicit UI note
  flags this, and no day is selected automatically. Wootton also requires an explicit
  day choice because regular and advisory patterns differ. Automatic Synergy times
  remain preferred over all backup presets.
- 216 tests and production build/typecheck passed. Browser verified all seven options
  and Frost grade selection; restored the user's previous fallback selection.
  Local changes only, not committed/pushed/deployed.

## 2026-10-22 — Fix automatic Synergy bell times (live verified)

- The mobile request incorrectly set loadAllTerms=true. Live comparison showed
  that false returns today's bell times in studentClassSchedule.todayScheduleInfoData;
  true returns only the all-term list. Changed the flag; existing parser recognizes
  the live daily response. No new calendar dependency or manual school selection.
- Local Gradebook confirmed “Using today’s StudentVUE bell times.” The observed
  response contained five daily meetings. Active in-class timer was not observed
  because verification occurred after school hours.
- Added a regression using fictional values in the observed daily response shape,
  with a transport that omits times when all-term mode is requested. 213 tests and
  production build/typecheck passed. Removed temporary schema-only diagnostics and
  their local output; no credentials or raw student records were saved.
- Local only; not committed, pushed, or deployed.

## 2026-10-22 — Correct local StudentVUE provider

- Set missing provider to mobile in ignored local .env and restarted the backend.
- Local health endpoint returned 200; live sign-in awaits user retry. No production
  configuration or application code changed.

## 2026-10-22 — Verify Gradr countdown sources

- Checked public Gradr frontend, school calendar endpoints, and mobile reference
  parser. Gradr combines StudentVUE school/course data with separate bell presets;
  its published mobile parser leaves start/end times empty.
- Blair calendar combines odd/even periods; no verified direct-Synergy daily
  contract found. Recorded evidence and next investigation step in the handoff.
- Documentation only; no runtime changes, credentials sent, deployment, or claim
  that automatic countdown is fixed. Application tests were not rerun.

## 2026-10-21 — Resolve main merge

- Combined local countdown commit `7ea53ef` with remote main through `9515206`:
  retained countdown/school presets alongside auto-refresh and current-period fixes.
- Resolved the sole text conflict by retaining both branches' changelog entries.
  212 tests and production build/typecheck passed. No deployment performed.

## 2026-10-21 — Request automatic mobile bell schedules

- Added authenticated StudentClassList mobile request on connect and uncached
  refresh; retains app compatibility header, fixed origin, cancellation, bounds,
  and one token renewal on 401. Schedule failure does not discard grades.
- Parse explicit daily containers (camel/Pascal-case) and valid 12/24-hour times;
  never infer today's timetable from all-term courses or invent missing times.
- Prefer current-day automatic data over presets, including recognized empty days.
  School selection remains a fallback when automatic times are unavailable.
- MangoGrade's public frontend uses normalized todayCourses/start/end from its
  own server; its raw StudentVUE response is still private. The method is evidenced
  by the public mobile migration, but daily parser variants are synthetic fixtures
  and require live MCPS verification. No claim of verified automatic countdown yet.
- 211 tests and production build/typecheck passed. Local only, not pushed/deployed.

## 2026-10-21 — Restore class countdown with school bell schedules

- The new mobile connection returns no bell times, which hid the existing timer.
  Added school/day selectors above gradebook classes for Montgomery Blair,
  Richard Montgomery, and Albert Einstein, plus custom times for other schools.
- Presets transcribed from official school sources linked in the UI; include
  regular, early-release and delayed-opening days, plus Blair all-period/homeroom
  options. RM period 2 includes the published RMBC segment through 9:30.
- Save bell preferences per Canvas account/browser; keep grades out of storage.
  Countdown uses America/New_York even on devices in other time zones. Weekends
  and stale StudentVUE schedules are suppressed. Special choices reset next day;
  Blair requires an explicit block selection. No holiday/calendar inference.
- Existing active-class highlight/countdown works in cards and table view.
  Fixed exact-end boundaries and prevented separate later classes being merged.
- 208 tests and production build/typecheck passed. UI has not been visually
  verified with a live account. Not committed, pushed, or deployed.
## 2026-10-18 — Mobile gradebook loads the current grading period

- The mobile client always sent `reportPeriod: 0`, so StudentVUE returned the
  first grading period on every load, even after auto-refresh was added. The
  first load now omits `reportPeriod` (as the `Zillorz/svue-api` reference does),
  so StudentVUE answers with the current period; its index is resolved by name,
  or by today's date when no current period is reported. Choosing a period still
  sends that index.
- 203 tests, typecheck and build passed. Live MCPS response not verified.

## 2026-10-18 — Gradebook fetches fresh grades automatically

- The Gradebook showed the grades loaded when the StudentVUE connection started,
  for up to an hour, until Refresh was clicked. It now fetches fresh grades from
  StudentVUE (via the selected mobile client) when the page opens, when the tab
  comes back into view, and every 5 minutes while visible. Failures stay quiet
  and keep the last grades; the existing 20-second server cache prevents duplicates.
- Resuming a saved sign-in on a still-healthy connection now re-fetches the
  current grading period instead of returning the old snapshot.
- 202 tests (one extended), typecheck and build passed. Not deployed.

## 2026-10-18 — Add new mobile app compatibility header from Gradr evidence

- Public Gradr frontend led to the open-source `Zillorz/svue-api` backend and
  its October 18 migration PR #2, which identifies required `edupointkeyversion`.
- Mobile login and grade requests now include the header; login envelope matches
  the new reference (`Student`, empty userID/password fields, Basic auth header).
- Added bounded, abortable, credential-free lookup of the public app-key value
  from the same fixed provider used by that backend. Credentials remain direct
  to MCPS; dependency on the public lookup is documented. No key hardcoded, no
  additional environment setting, no credential relay/provider fallback.
- Tests cover credential separation, malformed/oversized key replies, rotation,
  cancellation, header placement, and existing session behavior. 202 tests passed
  outside the Windows sandbox after its temporary-module read error; typecheck
  and production build passed. User confirmed the local live connection works
  on October 18 and requested committing/pushing to main. Render deployment unverified.
- MangoGrade's private server protocol remains
  unverified; its browser cookies alone do not establish StudentVUE authentication.

## 2026-10-18 — Investigate reported mobile-login change

- User reports the replacement StudentVUE app changed a login key and Better
  Canvas shows the generic account-notice error. No replacement key/header/field
  has been verified; do not claim authentication is fixed.
- Current reference mobile client still uses Basic AttemptLogin and access_token.
  A single credential-free MCPS request returned HTTP 401; this proves endpoint
  presence only, not acceptance of an actual student's login.
- Added failure stage (sign-in vs grade loading) and short numeric service codes
  to mobile errors, without exposing raw upstream messages or arbitrary code text.
- 191 tests, typecheck and production build passed. Diagnostics saved locally;
  authentication unchanged, not deployed. User's local diagnostic now confirms
  UPD5304 during sign-in; user confirms the new official app works with the same
  credentials. No verified replacement key found; need the updated request format
  to finish compatibility work.

## 2026-10-09 — Per-user schedule, Discord link, self-host README

- Removed the owner's hardcoded class list, periods and rooms from `schedule.ts` so
  other students can deploy their own copy. Course periods now come from the user's
  choice on the Courses page, else a period in the Canvas course/section name
  (Canvas sync now requests `include[]=sections`), else the course is listed last.
  Existing manual period choices keep working; previously auto-matched courses
  need a period picked once. Gradebook periods still come from StudentVUE.
- Added a support Discord link in the sidebar and Settings.
- README: step-by-step self-hosting guide with a Deploy to Render button, stressing
  that each student generates their own Canvas key and enters their own variables.
- Schedule tests run in a scratch project; full test suite, typecheck and build were
  not run on this checkout. Not committed or deployed.

## 2026-10-09 — Pin mobile provider in render.yaml; per-visitor login limit

- `render.yaml` now sets `STUDENTVUE_PROXY_PROVIDER=mobile`, matching the user's
  confirmed live setting, so a Blueprint sync cannot switch back to GradeDurian.
  The code default (GradeDurian when unset) is unchanged.
- Production now trusts the nearest proxy hop (`trustProxy`), so login and
  StudentVUE rate limits count each visitor separately instead of sharing
  Render's proxy address. Added a test for separate buckets and spoofed headers.
- Not run locally on this checkout (tests/typecheck/build pending); Fastify
  behavior was checked in a scratch project. Render's exact proxy hop count is
  unverified. Not committed or deployed.

## 2026-10-04 — User confirms direct mobile login works

- User confirmed successful MCPS mobile login after the Render provider selection
  discussion. Recorded this as user-reported live success, superseding the earlier
  authentication blocker. No provider setting or application code changed here.

## 2026-10-04 — Preserve standalone zero assignment scores

- Fixed StudentVUE parsing when Score reports 0/0% but Points lacks an earned
  numerator. The gradebook now receives earned=0 and displays 0 instead of NG.
- Applied the zero fallback to SOAP, website-session and mobile clients; preserved
  explicit points and left blank/ungraded scores and nonzero percentages unknown.
- All 185 tests, typecheck and production build passed. Local fix, not deployed.

## 2026-10-04 — Merge Claude into main and move active editing

- Merged the latest remote Claude history, the requested GradeDurian restoration,
  and existing main changes. Retained the direct mobile client and session fixes
  from `67c5878`; mobile mode is explicit, GradeDurian remains the default.
- Resolved overlapping provider configuration and context notes. Future work uses
  main in `C:\Users\hankw\Desktop\better canvas`; the nested worktree is retained.
- Installed main's locked dependencies. All 174 tests, typecheck, and production
  build passed, including a default-provider integration check. Deployment unverified.

## 2026-10-04 — Restore GradeDurian proxy

- At the user's request, student-ID/password sign-in defaults to GradeDurian again.
  Preserved parsers, remembered sign-in, browser-session beta and newer UI fixes.
- Old private relay variables are ignored by default and its bearer token is never
  sent to GradeDurian. Explicit `STUDENTVUE_PROXY_PROVIDER=private` retains the Worker option.
- Updated setup and credential-flow text. No new Render secret is required.
- Credential-free POST reached GradeDurian's route (HTTP 200, Missing data).
  137 tests, typecheck and build passed. Live MCPS authentication unverified;
  local changes, not yet deployed.

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
