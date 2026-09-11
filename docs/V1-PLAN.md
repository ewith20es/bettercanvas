# Better Canvas — v1 product and technical plan

Planning baseline: September 11, 2026. This is a proposed implementation plan, not an implemented app. Scope: one person's own MCPS Canvas account. MCPS token availability and the exact Canvas hostname remain unverified.

## 1. Product promise

Open the app and quickly answer: **What needs my attention, when is it due, and has Canvas recorded my submission?**

The app is a read-only companion. Canvas remains the place to read full instructions, submit work, and resolve discrepancies. Every assignment has an “Open in Canvas” link.

Success means:
- All selected active classes appear in one place.
- Submission status is readable without opening an assignment.
- Missing work never disappears merely because it has a grade.
- Failed or outdated data never looks like a confirmed clean slate.
- A phone-sized screen is comfortable to use.

## 2. Scope

Include all five planned pages, responsive navigation, assignment details, course selection, manual refresh, visible sync health, and an installable PWA with optional offline assignment storage.

Defer submission uploads, messaging teachers, grade prediction, notifications, AI prioritization, estimated effort, personal task creation, multi-account support, and cloud synchronization of preferences. Calendar v1 shows assignment deadlines only. Ungraded discussions, module requirements, and separate school events are not guaranteed coverage.

Do not offer a “mark submitted” checkbox. A local toggle must never impersonate a Canvas submission.

## 3. Pages and behavior

### Home

Top bar: selected-course scope, last successful update, Refresh, and an offline/partial-error message when needed.

Show **Needs attention** first for missing work, overdue unsubmitted work, and explicit requests to redo work. Keep **Check in Canvas** items distinguishable when completion cannot be confirmed.

Then show **Today**, **Tomorrow**, **Later**, and **No due date**. Later initially previews the next seven days, with a link to all upcoming work. Each assignment appears once in the main list; attention items are not repeated in a date bucket. A “Show submitted and graded” control reveals completed items, collapsed by default. Excused items stay out of the action queue.

Sort attention work by reason (redo requested, missing, overdue), then oldest applicable deadline first. Sort upcoming work by nearest deadline, with course and title as stable tie breakers. No hidden scoring formula. Locked items remain visible with “Locked — check Canvas,” but are not recommended as work that can be submitted now.

Display the reason for every recommendation: “Due today at 11:59 PM,” “Canvas marks this missing,” or “Resubmission requested.”

### Assignments

Search titles; filter by course; offer All / Upcoming / Missing / Submitted / Graded. Filters may overlap: a submitted assignment may also be graded. Upcoming means a future deadline, regardless of completion; add a “Needs work only” toggle. Missing means Canvas's missing flag, with a separate Overdue quick filter for the app's deadline calculation.

All includes undated assignments. Sort by due date by default, undated last. Preserve filters in the URL for navigation and refresh.

### Calendar

Month view plus a selected-day agenda; use the agenda as the primary phone view. Every agenda row uses the same status display as the assignment list. Show undated work in a separate list. Do not create fake midnight deadlines.

### Courses

Show visible active student courses, include/hide controls, optional local nicknames/colors, and a Canvas link. Each count reflects the same rules used on Home. Hidden courses remain available here; the app clearly states that Home totals cover selected courses. Concluded courses are excluded by default.

### Settings

Connection health; selected courses; timezone (default America/New_York); theme; offline-storage opt-in; last sync and per-course failures; clear local data; sign out where hosted authentication is used. Token replacement happens through private server configuration, not a frontend text box in v1. Explain that clearing cached data does not revoke the Canvas token.

### Assignment details

Use a drawer on larger screens and a full page on phones. Include name, course, due time, submission status/time, missing/late flags, available grade, points possible, availability/lock information, last checked time, and Open in Canvas. Full HTML instructions and attachments stay in Canvas for v1.

## 4. Status contract — the core of the app

Store submission, grading, deadline, and availability separately. Never reduce them to a single mutually exclusive status.

| Dimension | App labels |
| --- | --- |
| Submission | Submitted; Not submitted; Pending review; No online submission required; Check in Canvas; Status unavailable |
| Grading | Graded; Awaiting grade; Previous attempt graded; Grade not available |
| Deadline | Missing (Canvas); Late (Canvas); Overdue (calculated); Due today; Due tomorrow; Upcoming; No due date |
| Availability | Available; Locked; Excused; Resubmission requested |

Canvas provides submission timestamps, workflow state, missing/late/excused flags, grade information, and whether a grade matches the current attempt. Preserve these independently. A grade alone does not prove submission; zero is a valid score. For resubmission, distinguish a previous grade from the current attempt. [Canvas submission reference](https://developerdocs.instructure.com/services/canvas/resources/submissions)

Proposed normalization rules:
- Submitted requires positive evidence from the current submission record, such as a submitted timestamp or a submitted workflow state. Pending review gets its own label and is not treated as unsubmitted.
- A complete successful response with an explicitly unsubmitted record for an online assignment means Not submitted. An omitted submission on an otherwise complete response may represent no submission, but confirm the endpoint behavior during integration before treating it that way. Fetch the individual record if needed; unresolved absence means Status unavailable.
- External-tool work without reliable completion evidence says Check in Canvas. Paper work says No online submission required. Neither is automatically declared unfinished solely because no timestamp exists.
- Missing and Late reflect Canvas flags. An elapsed deadline alone produces Overdue, never an invented Canvas missing or late flag.
- Overdue requires an elapsed due time and confirmed unsubmitted online work. Unknown or external work uses “Past due — check Canvas.”
- Excused removes an item from recommendations. Missing plus a grade stays in Needs attention. Redo requests stay actionable even when an earlier submission exists.
- Conflicting evidence remains visible: for example, Submitted plus Missing (Canvas), with Check in Canvas. Do not silently pick the reassuring state.
- Only show grade values available to the student; never infer hidden grades. Compare against null/undefined rather than truthiness.

Every row gets a prominent text status and a secondary grading/deadline line. Use icons and words, not color alone. Example: **NOT SUBMITTED** / Biology lab / Biology · Today, 11:59 PM · 20 points. A completed counterpart reads **SUBMITTED** / Submitted today, 8:42 PM · Awaiting grade.

## 5. Recommended architecture

Use React + TypeScript + Vite for the client, React Router for pages, plain CSS with shared design tokens, Dexie for opted-in offline data, and a small Node + TypeScript backend using Fastify. Use a Vite-compatible PWA service-worker integration. Pin compatible package versions when implementation begins.

```text
React PWA ── same-origin authenticated API ── private backend ── Canvas REST API
    │                                           │
    └── optional Dexie data cache                └── server-only access token
```

The backend owns Canvas authentication, pagination, response validation, normalization, and bounded request concurrency. The frontend owns display, filtering, and time-based grouping. Shared pure functions define status and priority, so tests and screens use one contract.

Begin on localhost, binding the server to loopback. For phone use away from the development computer, deploy the frontend and backend together behind HTTPS and an access gate restricted to your identity. That deployment also needs server-side enforcement of the authenticated identity on every data route. An obscure URL is not authentication. Localhost on a phone refers to the phone, not the development computer.

A hosted frontend by itself does not satisfy the recommended token design. Decide the private hosting/access provider before deployment, not before local prototyping.

## 6. Token and privacy design

Use the exact verified MCPS Canvas host and a personal token only if the account permits it. Canvas documents manual token creation and treats tokens as password-equivalent. Its guidance requires OAuth if the app expands to other users. MCPS availability cannot be concluded from generic Canvas documentation. [Canvas authentication guidance](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth)

- Store the token in a backend-only environment variable or deployment secret. Local secret files are ignored by Git.
- Never put it in VITE_* variables, frontend bundles, URLs, localStorage, IndexedDB, source maps, screenshots, or logs.
- Backend requests use the Authorization header. Expose only specific read endpoints, never a general-purpose URL proxy.
- Allowlist the configured Canvas origin, including pagination links and redirect handling; never forward credentials to another origin.
- Use only read operations against Canvas. A personal token may have broader privileges; the app's read-only behavior does not change token permissions.
- Validate same-origin requests and protect state-changing app routes against CSRF. For hosted sessions use Secure, HttpOnly cookies with an appropriate SameSite setting, or an access gateway whose identity is verified server-side.
- Exclude private API responses from shared/CDN and service-worker caches. Use explicit no-store responses; optional Dexie persistence is the intentional private-data cache.
- No analytics or raw payload logging. Keep safe error codes and request timing only. Render names as text; do not inject Canvas HTML.
- Cache only required metadata, not submission bodies, files, comments, or token material. Namespace storage by Canvas host and user ID. Clear account data on logout/account change and offer cache deletion.
- Offline storage is opt-in per trusted device. It is readable to someone with access to that browser profile; it is not a secure vault. It may also be evicted by the browser.

## 7. Canvas API integration

| Purpose | Planned request |
| --- | --- |
| Validate identity | GET /api/v1/users/self/profile |
| List own active student courses | GET /api/v1/courses?enrollment_type=student&enrollment_state=active |
| Assignments and own submission | GET /api/v1/courses/:courseId/assignments?include[]=submission |
| Resolve an ambiguous record | GET /api/v1/courses/:courseId/assignments/:assignmentId/submissions/self |

The assignments endpoint can include the requesting user's submission. Use the effective user-specific due date rather than manually combining section overrides. Do not use has_submitted_submissions to infer your own completion; it is assignment-wide. [Canvas assignments reference](https://developerdocs.instructure.com/services/canvas/resources/assignments)

Course selection starts with the authenticated user's student enrollments. [Canvas courses reference](https://developerdocs.instructure.com/services/canvas/resources/courses)

Follow every rel="next" Link header; do not assume the first page or a requested page size is complete. Validate the next URL before forwarding authorization. [Canvas pagination reference](https://developerdocs.instructure.com/services/canvas/basics/file.pagination)

Fetch all accessible assignments for selected active courses, not only upcoming items, so older missing work is retained. Start with at most three concurrent course fetches. Retry transient failures with bounded exponential backoff and jitter; honor Retry-After when supplied. Stop retrying invalid credentials; isolate forbidden courses and retain their last known snapshot as stale.

## 8. Data and synchronization

Shared records:
- Account: Canvas origin and user ID.
- Course: ID, original name, course code, enrollment state; separate local nickname/color/visibility preferences.
- Assignment: course/assignment IDs, name, Canvas URL, effective due/unlock/lock times, points possible, submission types, locked state.
- Submission: source workflow, submitted time, missing/late/excused values, score/grade, grading time, current-attempt grade match, redo flag. Preserve unknown as unknown.
- Sync metadata: per-course last attempt, last complete success, outcome, and safe error message; dataset generation and schema version.

Use string IDs internally. Store timestamps as ISO instants; group days with an IANA timezone. Tomorrow is the next calendar day, not a fixed 24-hour offset. Recompute at midnight, on focus, and after settings changes.

Proposed app API: GET /api/bootstrap for identity/connection state; GET /api/snapshot for normalized cached results; POST /api/sync to refresh selected courses. The backend checks requested course IDs against the user's own accessible courses. Sync returns per-course outcomes and records from complete successful course fetches only.

At startup, show cached data immediately if enabled, then refresh. Offer manual refresh; refresh on focus when older than five minutes and every five minutes while visible. Coalesce overlapping refreshes. No continuous background-sync promise.

Replace a course snapshot only after every page succeeds. Remove disappeared assignments only following a complete authoritative course refresh. Failed courses retain their previous snapshot and timestamp. Dexie writes each successful course snapshot and its metadata in one transaction. Persist facts, not time-sensitive display labels.

Treat data older than 15 minutes as stale by default. Say “No outstanding work in updated courses” only when coverage warrants it; partial failure cannot produce a global all-clear. Keep per-course failures visible even when another course refreshes successfully.

Service worker: cache the app shell and static assets, not /api responses. Offline mode shows saved assignments plus the original last-checked time. Installability and offline relaunch require verification on the intended browser/device; offline mode cannot discover a new submission or grade.

## 9. Proposed project structure

This is the target structure for implementation; only this planning document exists now.

```text
better-canvas/
  docs/
    V1-PLAN.md
    canvas-field-mapping.md
  apps/
    web/
      public/icons/
      src/
        app/                 # router, layout, initialization
        pages/               # Home, Assignments, Calendar, Courses, Settings
        components/          # AssignmentRow, StatusBadge, SyncBanner, EmptyState
        features/assignments/
        features/courses/
        features/settings/
        data/                # app API client, Dexie, sync coordinator
        styles/              # tokens and responsive styles
        pwa/                 # service-worker registration/update UI
      index.html
      vite.config.ts
      package.json
    server/
      src/
        index.ts
        config.ts
        auth/                # local/hosted access enforcement
        routes/              # bootstrap, snapshot, sync
        canvas/              # client, pagination, API schemas, normalization
        sync/                # concurrency, snapshots, course outcomes
      .env.example           # placeholders only
      package.json
  packages/
    domain/src/              # records, status rules, priority, time grouping
  tests/
    fixtures/                # synthetic Canvas examples only
    unit/
    integration/
    e2e/
  .gitignore
  package.json               # npm workspaces and scripts
  tsconfig.base.json
  README.md
```

Keep page-specific components beside their feature; promote only reused components. Use one repository and npm workspaces, without an additional monorepo framework. Planned scripts: dev, build, typecheck, lint, test, test:e2e.

## 10. Implementation sequence and acceptance

1. **Access check:** confirm the actual Canvas host, token creation availability, own identity, course enumeration, and one assignment/submission response. Keep the token out of chat. Compare API values against Canvas. If blocked, continue with synthetic fixtures and label live integration unavailable; do not substitute password storage or login scraping.
2. **Status foundation:** build the shared data model, normalizer, and rule tests. Include unsubmitted, submitted, graded zero, graded missing, late submitted, excused, paper, external tool, undated, locked, resubmitted, conflicting, and unavailable-data fixtures.
3. **Useful vertical slice:** backend plus Home, complete pagination, all selected courses, clear status rows, refresh, and Canvas links. Check representative real assignments manually.
4. **Remaining pages:** Assignments filters/details, Courses, Calendar agenda/month, and Settings. Verify consistent counts and statuses across screens.
5. **Offline and deployment:** optional Dexie, cache clearing, PWA shell, update prompt, private hosted authentication if phone access is needed.
6. **Release checks:** unit tests for status/timezone boundaries and DST; integration tests for pagination, partial failure, deletion, expired tokens, and no false all-clear; browser tests for navigation/filtering, offline relaunch, and mobile layout. Verify keyboard access, readable contrast, visible focus, and comfortable touch targets.

Release requires: correct statuses against sampled real Canvas records; full selected-course coverage; no secrets in built client assets or logs; unauthorized hosted requests denied; offline/stale data clearly labeled; and no missing work hidden by an existing grade.

## 11. Decisions still to verify

- Exact MCPS Canvas hostname and personal-token/API availability.
- Whether primary use is one computer or also a phone away from home; this determines private hosting needs.
- Whether current classes use external tools whose completion Canvas cannot reliably expose.
- Which courses belong in the daily view.

These do not prevent planning or fixture-based UI work. Live integration depends on the first item; remote deployment depends on a concrete authentication and hosting choice.
