# Better Canvas — current project context

Last updated: **October 1, 2026**. Read [CLAUDE.md](CLAUDE.md) for working rules
and [CHANGELOG.md](CHANGELOG.md) for history.

## Purpose and stack

Personal MCPS app answering “what should I work on next?” across all classes.
Canvas assignments/submission status and StudentVUE grades are separate data sources.
React + strict TypeScript + Vite + PWA frontend; Fastify Node backend; Dexie for
optional Canvas offline storage. One Render web service serves frontend and API.

## Where work lives

- Repository: <https://github.com/ewith20es/bettercanvas>
- Active branch: `claude/gradebook-synergy-integration-2fbac6`
- Current local checkout: `C:\Users\hankw\Desktop\better canvas\.claude\worktrees\gradebook-synergy-integration-2fbac6`
- The containing `better canvas` checkout is older and separate. Use the active
  checkout explicitly for commands; do not switch/merge the outer checkout automatically.
- Site: <https://bettercanvas.onrender.com/gradebook>
- Last recorded live application commit: `b496986` (September 25). Check actual Git
  and Render state before treating this dated snapshot as current.

## Current work and verification

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

**Still unfinished:** fully automatic StudentVUE login with student ID/password.
MCPS rejects the existing SOAP request with `UPD5304`; the working official website
does not imply SOAP acceptance. The user confirms MangoGrade loads their own MCPS
grades with ID/password. Its private upstream login process remains unknown.
See [connection research and next steps](docs/STUDENTVUE.md) before continuing.

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
| `apps/server/src/synergy.ts` | SOAP client, parsing, relay/error handling |
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
Schedule order is Homeroom, English, Spanish, Photography, Functions, Lunch,
Physics, Research, Computer Science, AP US History, Advisory. The domain schedule
module is the source of truth for matching actual course names.

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
`STUDENTVUE_RELAY_URL`, `STUDENTVUE_RELAY_TOKEN`, optional `APP_ORIGIN`.
Canvas origin is `https://mcpsmd.instructure.com`. See README and `.env.example` for
setup; Render normally supplies its external origin.

Cloudflare Worker `studentvue-relay` has secret `RELAY_TOKEN`, matching Render's
`STUDENTVUE_RELAY_TOKEN`. Its configured endpoint is
`https://studentvue-relay.ezsmile331.workers.dev/fulfillAxios`. A healthy Worker
does not establish successful StudentVUE login. The browser-session beta connects
directly to MCPS and requires no additional relay variables.
