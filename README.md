# Better Canvas

A personal, read-only companion for MCPS Canvas assignments and StudentVUE grades. React + TypeScript + Vite frontend, Fastify backend, and an installable PWA. Both parts deploy together as one Render web service.

## Try it locally

Use Node 24 LTS (22.12 or newer also supported).

```sh
npm ci --include=dev
npm run dev
```

Open **http://127.0.0.1:5173**. Without a Canvas token, the app uses clearly labeled sample assignments. No account or credential is needed to explore demo mode.

If a build reports that `tsc` is not recognized, run `npm install --include=dev` and retry `npm run build`. TypeScript and Vite are development dependencies, but they are required to build the app, including on Render.

## Connect your own Canvas account

1. If MCPS permits it, generate a personal token in your Canvas account settings. Do not send it through chat.
2. Copy `.env.example` to `.env` in the repository root.
3. Set `CANVAS_ACCESS_TOKEN` and `APP_PASSWORD`. The app passphrase must be at least 8 characters and must be different from your Canvas password. Prefer a long randomly generated passphrase saved in your password manager.
4. Restart the app and sign in using the app passphrase.

The app never requests or stores your Canvas password. If a token is configured without a sufficiently long app passphrase, the backend refuses to start. The exact Canvas origin is restricted to `https://mcpsmd.instructure.com`.

MCPS token permission and actual account responses still need to be verified using your own account. Generic Canvas API support does not guarantee a school permits personal tokens.

## Connect StudentVUE / Synergy grades

**MCPS SOAP block (UPD5304):** MCPS rejects direct StudentVUE SOAP calls with `UPD5304-00` ("update your app"). The block is applied at the network layer — a byte-identical request is refused when sent straight from a server but accepted when relayed through a StudentVUE proxy. Better Canvas therefore sends the same SOAP envelope through the StudentVUE proxy used by [GradeDurian](https://github.com/btdpass/GradeDurian) (`cloudproxy.gradedurian.workers.dev`), which reaches Synergy on the app's behalf. This is the same integration path GradeDurian uses, so the standard student ID / password connection works again.

To connect:

1. Set `APP_PASSWORD` to at least 8 characters and restart the server. This protects the connection even if you are using Canvas demo mode.
2. Sign in to Better Canvas, open **Gradebook**, and enter your MCPS student ID and StudentVUE password directly in the app. Do not send credentials in chat or commit them to GitHub.
3. Choose a grading period and select a course to see its reported grade, categories, assignments, points, and teacher notes. Courses appear in StudentVUE period order. Use **Refresh grades** to check again.

All gradebook data comes from **StudentVUE / Synergy**, never from Canvas. The backend builds the StudentVUE SOAP request for `https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx` and relays it through the GradeDurian StudentVUE proxy, which forwards it to Synergy; your StudentVUE credentials pass through that proxy in transit. Canvas remains the source for the separate assignment/submission views.

StudentVUE requires credentials with each request. The live connection is held in server memory for **one hour**, scoped to your signed-in app session; a cleanup timer removes expired connections within 30 seconds.

**Keep me signed in** (on by default in the connect form) saves your StudentVUE sign-in so you do not retype it when you reopen the app, after the hour ends, or after Render restarts. The student ID and password are encrypted with AES-256-GCM using a server-only key and stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie that is sent only to `/api/gradebook` and expires after 30 days. Page scripts cannot read it, and it is useless without a signed-in Better Canvas session. The app reconnects automatically on launch and renews the connection shortly before each hour ends. Disconnecting StudentVUE, signing out of Better Canvas, or StudentVUE rejecting the saved password deletes it. Untick the box to keep the old memory-only behavior.

The encryption key comes from `GRADEBOOK_SECRET` (32+ random characters; Render generates one from `render.yaml`) or, if that is not set, from `APP_PASSWORD`. Changing either signs every device out of StudentVUE. Nothing is saved to a database, browser storage, service-worker cache, logs, or source code.

The page uses GradeDurian-inspired grade cards, progress bars, category breakdowns, and a what-if calculator. Reported grades are displayed unchanged. The calculator adds one hypothetical assignment to Synergy's category totals, renormalizes populated category weights, and labels the result as an **estimate**. It never changes StudentVUE and does not claim to calculate an official GPA or final grade. Unknown weights or totals disable the estimate; unknown scores are not treated as zero. Schools using standards-based gradebooks receive an unsupported-format message.

Use **Preview with sample grades** to explore without connecting. Samples are always labeled and are never substituted for a failed live request. Gradebook updates are manual, with a 20-second server cache to avoid duplicate requests; this page does not poll StudentVUE. On a failed update, the last successful grades remain with their timestamp and an error notice.

The connection is unit-tested with synthetic Synergy responses. The proxy relay was verified to reach live MCPS Synergy authentication (a wrong-credential probe returns Synergy's real "Invalid user id or password" error rather than `UPD5304`), so a valid student ID and password should load real grades; sign in with your own account to confirm. If the proxy is unavailable, the app keeps the last successful grades and shows a retry notice.

References: [GradeDurian](https://github.com/btdpass/GradeDurian) (design reference), [studentvue.js](https://github.com/jshap06/studentvue.js/tree/unified) (protocol/field reference), [MCPS StudentVUE service description](https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx?WSDL). The supplied [gradebook-api](https://github.com/team-llambda/gradebook-api) wraps a separate third-party service and is not a dependency. This implementation does not copy GradeDurian's source or assets.

## Deploy frontend and backend on Render

Push this repository to your GitHub repository, then connect it to a Render **Web Service**. The repository includes `render.yaml` for Blueprint setup, or use these manual settings:

| Setting           | Value                                   |
| ----------------- | --------------------------------------- |
| Language          | Node                                    |
| Branch            | main                                    |
| Region            | Virginia                                |
| Root directory    | Leave blank                             |
| Build command     | `npm ci --include=dev && npm run build` |
| Start command     | `npm start`                             |
| Health check path | `/api/health`                           |
| Compute           | Free for the prototype                  |

Set these in Render's Environment panel:

| Variable              | Value                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `production`                                                                                                                    |
| `NODE_VERSION`        | `24.18.0`                                                                                                                       |
| `CANVAS_BASE_URL`     | `https://mcpsmd.instructure.com`                                                                                                |
| `CANVAS_ACCESS_TOKEN` | Your own Canvas token; enter directly in Render                                                                                 |
| `APP_PASSWORD`        | A separate strong app passphrase, at least 8 characters                                                                         |
| `GRADEBOOK_SECRET`    | Optional. 32+ random characters that encrypt remembered StudentVUE sign-ins. Falls back to `APP_PASSWORD`.                      |
| `APP_ORIGIN`          | Optional for the default Render address; required for a custom domain. Use the exact HTTPS app origin without a trailing slash. |

The backend automatically uses `RENDER_EXTERNAL_URL` for the standard Render address and listens on Render's assigned `PORT`. It serves the React build and `/api` from the same origin. Do not prefix secrets with `VITE_`.

To first deploy a public demo, leave the Canvas token and app passphrase empty. **This only serves sample data.** Add both secrets together before switching to live Canvas data. Live mode is protected by the app passphrase on every assignment-data route.

The free service may sleep. The first visit can take longer while it wakes. Sessions and the server's assignment snapshot are in memory: a restart or sleep that restarts the process requires signing in again. This v1 uses one server instance. It does not need a cloud database or persistent disk.

## Features

- Home: missing/overdue/redo work first, followed by Today, Tomorrow, Later, and undated work.
- Assignments: search, course filter, All / Upcoming / Missing / Submitted / Graded / Hidden, plus a Needs work filter. Missing includes both Canvas-marked missing work and overdue unsubmitted assignments, with a red count badge when any remain. Hidden assignments and courses are excluded from the badge.
- Hide announcement-like assignments with the eye button. They turn gray until you leave the current page or assignment tab. Find and restore them under Hidden, with search, course/status filters, and sorting by due date, name, or course. Hiding is saved per account on this device and does not change Canvas.
- Calendar: assignment deadlines, month navigation, selected-day agenda, and undated work.
- Courses: show/hide courses, local nicknames and colors.
- Gradebook: StudentVUE connection, grading periods, schedule-ordered grade cards, course/category details, searchable and sortable assignment scores, and a what-if estimate for a new assignment.
- Settings: connection state, per-course update results, timezone, theme, optional offline data, installation instructions, clear data, and sign out.
- Assignment details: due/submitted times, grading, missing/late flags, points, availability, and the Canvas link.

Submission, grading, and deadline status are independent. A graded zero can still be missing. Overdue is calculated; Missing and Late come from Canvas. External-tool or absent submission data gets an explicit check/unavailable label. The app cannot submit work or mark something submitted.

## Offline behavior

The service worker caches only the app shell and static assets. Private API responses use `Cache-Control: no-store` and are excluded from service-worker caching. Turn on **Offline assignments** in Settings to save normalized assignment metadata in Dexie on a trusted device. Cached data is not encrypted and can be read by someone using that browser profile. No submission bodies, comments, attachments, or tokens are cached.

The app refreshes on launch, after reconnecting, on focus when older than five minutes, and every five minutes while visible. Data older than 15 minutes is marked stale. Course snapshots update only after all pages succeed; failed courses retain their old data and timestamp. A server restart can temporarily remove its in-memory snapshots; opted-in device caches remain available offline.

Offline mode cannot learn about new submissions or grades. Browser storage can be evicted. Sign-out requires a server connection, invalidates the session, and clears saved local data. Clearing local data does not revoke your Canvas token.

## Development and checks

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the compiled app at http://127.0.0.1:3001 by default. To test that combined build locally, set `APP_ORIGIN=http://127.0.0.1:3001` in `.env` (restore port 5173 for `npm run dev`). Do not set `NODE_ENV=production` for this HTTP-only local preview; production requires an HTTPS origin.

The test suite covers status edge cases, timezones/DST, pagination, unsafe next links, expired tokens, retries, partial-course preservation, authentication, CSRF origin checks, session invalidation, and login rate limiting. Browser checks should cover all routes, assignment details, course visibility, narrow screens, theme changes, and offline reload of the built app.

Regenerate the committed PWA icons after changing the favicon with `node scripts/prepare-icons.mjs`.

## Structure

```text
apps/web/             React pages, styles, Dexie cache, Vite/PWA configuration
apps/server/src/      App authentication, Canvas sync, proxied Synergy gradebook client
packages/domain/src/ Shared data types, status rules, dates, synthetic demo data
tests/               Domain and backend regression tests
scripts/             PWA icon generation
docs/V1-PLAN.md       Original product and technical plan
render.yaml          Render deployment configuration
```

Dependencies are managed at the repository root; the small app does not need separate package installations. Uploads, messaging, notifications, multi-user OAuth, general school calendars, and syncing preferences across devices are outside v1.

API references: [Canvas assignments](https://developerdocs.instructure.com/services/canvas/resources/assignments), [submissions](https://developerdocs.instructure.com/services/canvas/resources/submissions), [pagination](https://developerdocs.instructure.com/services/canvas/basics/file.pagination), [authentication](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth).
