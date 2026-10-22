# Better Canvas — current project context

Last updated: **October 21, 2026**. Read [CLAUDE.md](CLAUDE.md) for working rules
and [CHANGELOG.md](CHANGELOG.md) for history.

## Purpose and stack

Personal MCPS app answering “what should I work on next?” across all classes.
Canvas assignments/submission status and StudentVUE grades are separate data sources.
React + strict TypeScript + Vite + PWA frontend; Fastify Node backend; Dexie for
optional Canvas offline storage. One Render web service serves frontend and API.

## Where work lives

- Repository: <https://github.com/ewith20es/bettercanvas>
- Active branch: `main`
- Current local checkout: `C:\Users\hankw\Desktop\better canvas`
- On October 4, the user requested merging Claude into main and editing here.
  The nested Claude worktree is retained, but is no longer the active editing location.
- Site: <https://bettercanvas.onrender.com/gradebook>
- Last recorded live application commit: `b496986` (September 25). Check actual Git
  and Render state before treating this dated snapshot as current.

## Current work and verification

October 21 merge: combined local countdown commit `7ea53ef` and remote main
through `9515206` (gradebook auto-refresh and current-period loading). Only
CHANGELOG.md conflicted; both histories were retained. 212 tests and production
build/typecheck passed. Deployment and live schedule verification remain pending.
This supersedes the uncommitted status in the historical notes below.

October 21 follow-up: mobile StudentClassList is now requested on connection and
uncached grade refresh, using the same app header and bearer token with one renewal
on 401. Daily schedule containers are parsed conservatively; all-term lists are
not used as today's times. Current-day automatic schedules take priority over
school presets, including explicitly empty days. 211 tests/build/typecheck pass.
Parser fixtures are synthetic; real MCPS daily response compatibility still needs
user verification. All countdown changes remain local, uncommitted/unpushed.

October 21: restored gradebook countdowns through a school/day dropdown with
officially sourced Blair, Richard Montgomery, and Einstein bell schedules plus
custom times. Preferences are scoped to the Canvas account on this browser;
no grades are persisted. School time is Eastern, weekends are suppressed,
special-day choices expire daily, and Blair block days require explicit selection.
Holidays/advisory calendars are not automatically detected; choose pause/custom
as needed. Existing StudentVUE times remain available when no school is selected.
208 tests and production build/typecheck passed. Local only, not pushed/deployed.

October 18 follow-up: found Gradr's public backend `Zillorz/svue-api` and its
new-app migration PR #2. Added its required `edupointkeyversion` header and updated
student login envelope. Public app-key lookup goes to `axum-svue.fly.dev/akey`
without account information; credentials/grade calls still go only to MCPS.
No new environment variables; keep provider `mobile`. This adds a public key-service
dependency. 202 tests and production build/typecheck passed. User confirmed the
local live connection works on October 18 and authorized committing/pushing to
main. Render deployment remains unverified. See docs/STUDENTVUE.md for evidence.

Earlier October 18 investigation (superseded by the identified header above):
October 18: user reports mobile login failing with a generic StudentVUE error
after an app replacement. Current code has no static app key; it exchanges Basic
credentials for access_token. No new authentication format verified. Added safe
stage/numeric-code diagnostics locally; 191 tests/typecheck/build passed. User now
confirms UPD5304 during sign-in, before grade loading, while the new official app
works with the same credentials. Need verified changed request fields before
making an authentication edit.
Earlier October 4 success is historical, not proof of current compatibility.

Latest user confirmation (October 4): direct mobile StudentVUE login works for
their MCPS account after discussing `STUDENTVUE_PROXY_PROVIDER=mobile` on Render.
This supersedes earlier mobile-login uncertainty below. Verification is user-reported;
the live environment and every grade field have not been independently audited.
Keep mobile selected for their deployment; do not revert it to the default proxy.

Latest local fix: standalone StudentVUE Score 0/0% now populates earned=0 when
the points numerator is absent, so the gradebook displays 0 instead of NG.
185 tests, typecheck and build passed. Not pushed or deployed.

October 4 merge: preserved remote commit `67c5878` (direct mobile client and session
fixes) alongside the requested GradeDurian default. Use
`STUDENTVUE_PROXY_PROVIDER=mobile` to select direct MCPS, `private` for the owner's
Worker, or leave unset for GradeDurian. No automatic provider fallback occurs.
Merged branch history into main. All 174 tests, typecheck and production build
passed in the main checkout; deployment has not been verified.

October 4: user requested restoring GradeDurian's now-responsive proxy. Code defaults
to GradeDurian, ignoring old private relay variables unless
`STUDENTVUE_PROXY_PROVIDER=private`. No new secret needed. 137 tests, typecheck/build
passed; credential-free endpoint probe succeeded, live MCPS sign-in unverified.
This switch is local, not deployed. Earlier assignment changes were committed and
pushed as `d5afa1c` October 1; their deployment was not verified.

October 1 local change: past-due, unsubmitted, ungraded work (including paper,
external tools and unknown submission data) shows Missing and counts toward its
indicator. Per-assignment checkmarks save a reversible Submitted in person record
in per-account browser preferences. These clear Missing/attention locally without
changing Canvas data; Submitted/All allow undo. 136 tests and production build
passed. Not deployed.

September 28 local change: Upcoming assignments have due-date groups/dividers in
the selected timezone. Submitted, Graded, and Hidden default to latest due date first;
other tabs default to earliest. Changing tabs resets the sort. Name/course sorting
in Upcoming is within each date. Typecheck and production build passed; not deployed.

Local addition: Canvas key countdown above the sidebar profile and editable in
Settings. Defaults to December 10, 2026 at midnight Eastern. The reminder date is
saved per account/browser, not synced or fetched from Canvas. Latest local checks:
134 tests, typecheck, and production build passed. This addition is not deployed.
See `apps/web/src/TokenExpiry.tsx` and `token-expiry.ts`.

The browser-session StudentVUE beta exists. Commit `b496986` fixes rejection of
courses whose default portal tab was posts/rich content by requesting the assignment
view explicitly. That commit was deployed and passed **130 tests, typecheck, and
production build**. The user's full live grade load after this fix is **not confirmed**.

**Still unverified:** successful MCPS StudentVUE student ID/password authentication
with the new mobile API. The private SOAP relay previously returned `UPD5304`;
GradeDurian SOAP is restored as the default at the user's request. The mobile
connection does not yet fetch a bell schedule. See
[connection research and next steps](docs/STUDENTVUE.md) before continuing.

The local browser's old `127.0.0.1:4188` tab is not proof a server is running. That
temporary synthetic preview was stopped. Normal development uses ports 5173/3001.

## Code map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/App.tsx`, `views.tsx` | App navigation and assignment/course views |
| `apps/web/src/Gradebook.tsx`, `gradebook.css` | Gradebook UI, theme, connection forms, what-if tools |
| `apps/web/src/data.ts` | Frontend data handling |
| `apps/server/src/app.ts`, `index.ts` | Fastify setup, app auth, routes, server entry |
| `apps/server/src/canvas.ts` | Canvas API client |
| `apps/server/src/gradebook-routes.ts` | StudentVUE connection lifecycle and grade routes |
| `apps/server/src/studentvue-mobile.ts` | Direct MCPS student token login and mobile JSON gradebook parser |
| `apps/server/src/synergy.ts` | Shared error/client types and historical SOAP client/parser |
| `apps/server/src/studentvue-web.ts` | MCPS authenticated website client and parser |
| `apps/server/src/sessions.ts`, `remember.ts` | App sessions and encrypted remembered StudentVUE credentials |
| `packages/domain/src/` | Assignment status, schedule matching, grade calculations, demo fixtures |
| `workers/studentvue-relay/` | Owner-controlled Cloudflare relay and setup guide |
| `tests/` | Authentication, clients, parsers, calculations, schedules and relay tests |
| `docs/V1-PLAN.md`, `docs/VERIFICATION.md` | Original plan and historical September 11 verification |

## Product details

Home, Assignments, Calendar, Courses, Settings, and Gradebook are implemented.
Preserve course list/gallery, hidden assignments, combined Missing filter, and the
Grade Melon grade colors, including calculated letters for percentage-only grades.
Courses are ordered by period. As of October 9 no personal timetable is built in:
`schedule.ts` uses the user's per-course period choice, else a period written in the
Canvas course/section name, else lists the course last. The app is intended to be
self-hosted by individual MCPS students (README "Set up your own copy").

## Run and deploy

From the active checkout:

```sh
npm ci --include=dev
npm run dev
npm test
npm run typecheck
npm run build
npm start
```

`dev` starts frontend 5173/backend 3001. `start` runs the built server. Without a
Canvas token the app labels sample assignments as demo data. Node >=22.12 is supported;
Render was configured with 24.18.0. Package files remain the version source of truth.
On Windows, stop this project's dev process before reinstalling if esbuild is locked.

Render: Node Web Service, Virginia, Free; build `npm ci --include=dev && npm run build`,
start `npm start`, health `/api/health`. The last verified deployed branch is the
Claude branch above; README's generic `main` example is not the live branch record.

Configuration names (never put values here): `APP_PASSWORD` (minimum 8 characters),
`APP_SECRET`, `CANVAS_ACCESS_TOKEN`, `CANVAS_BASE_URL`, `NODE_ENV`, `NODE_VERSION`,
optional `APP_ORIGIN`, `STUDENTVUE_PROXY_PROVIDER`, `STUDENTVUE_RELAY_URL` and
`STUDENTVUE_RELAY_TOKEN`. The last two are used only in private-provider mode.
Canvas origin is `https://mcpsmd.instructure.com`. See README and `.env.example` for
setup; Render normally supplies its external origin.

Historical Cloudflare Worker `studentvue-relay` has secret `RELAY_TOKEN`, matching Render's
`STUDENTVUE_RELAY_TOKEN`. Its configured endpoint is
`https://studentvue-relay.ezsmile331.workers.dev/fulfillAxios`. A healthy Worker
does not establish successful StudentVUE login. Both current mobile login and the
browser-session beta connect directly to MCPS and require no relay variables.
