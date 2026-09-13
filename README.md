# Better Canvas

A personal, read-only companion for one MCPS Canvas account. React + TypeScript + Vite frontend, Fastify backend, and an installable PWA. Both parts deploy together as one Render web service.

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
apps/server/src/      App authentication, Canvas client, synchronization
packages/domain/src/ Shared data types, status rules, dates, synthetic demo data
tests/               Domain and backend regression tests
scripts/             PWA icon generation
docs/V1-PLAN.md       Original product and technical plan
render.yaml          Render deployment configuration
```

Dependencies are managed at the repository root; the small app does not need separate package installations. Grade estimates, uploads, messaging, notifications, multi-user OAuth, general school calendars, and syncing preferences across devices are outside v1.

API references: [Canvas assignments](https://developerdocs.instructure.com/services/canvas/resources/assignments), [submissions](https://developerdocs.instructure.com/services/canvas/resources/submissions), [pagination](https://developerdocs.instructure.com/services/canvas/basics/file.pagination), [authentication](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth).
