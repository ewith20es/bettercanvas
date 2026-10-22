# StudentVUE connection handoff

Updated October 21, 2026. This records implementation evidence and unresolved
work, not a claim that every connection works with a live account.

## October 21: countdown fallback

Initially the mobile client's schedule method returned no meetings. The public migration
schedule implementation (`Zillorz/svue-api`, commit `d75f429`, `src/api/schedule.rs`)
calls StudentClassList but explicitly emits empty start/end times. Do not invent
mobile bell fields or switch authentication providers to restore the countdown.

Follow-up: implemented the evidenced StudentClassList request using that migration's
body (childIntID, loadAllTerms, conSchOrgYearGU, conSchTermIndex, termIndex). Daily
parsing supports explicit todayScheduleInfoData/todaySchedule/todayCourses containers
with start/end times and case variants; those shapes are compatibility hypotheses
covered with synthetic fixtures, not captured real MCPS data. Missing daily fields
yield unavailable times, never invented meetings. MangoGrade's public frontend
confirms its own normalized todayCourses/start/end contract, not the raw upstream
schema. Live verification remains required. Automatic daily data now takes priority
over manual presets; refresh reloads optional schedule without failing grades.
211 tests/build/typecheck passed. Local, uncommitted/unpushed.

The gradebook now offers a school/day dropdown and custom bell times, stored only
as per-account browser preferences. Preset sources checked October 21:
- Blair: https://mbhs.edu/schedule (block, all-period, delay, early, homeroom).
- RM: official homepage links the 26–27 bell document at
  https://docs.google.com/document/d/1AmpwjSJlXZMseWaDFIK5xiuCAVdiqmxSZkTK8Aa03PE/edit.
- Einstein: https://www.montgomeryschoolsmd.org/contentassets/ed4fa6fb482b4560b892d169fdbbf82d/bell-schedule.pdf.

These are published timetable presets, not a live calendar: holidays and special
days need a user selection; Blair block days are never guessed. Eastern time,
weekend suppression, daily expiry of overrides, and current-day checks on live
StudentVUE schedules prevent stale timer reuse. 208 tests and build passed; local only.

## October 18 follow-up: Gradr backend identifies the missing header

- Inspected public Gradr bundles at `https://praneel4smob.com/`: login sends Basic
  auth to `https://axum-svue.fly.dev/grades`, reads `Set-Token`, then uses Bearer
  for subsequent calls. No account credentials were sent during this investigation.
- Found its backend's public repository: [Zillorz/svue-api](https://github.com/Zillorz/svue-api).
  [Migration PR #2](https://github.com/Zillorz/svue-api/pull/2), merged October 18,
  explicitly says `edupointkeyversion` is required and reports live MCPS testing.
  Source checked at `cb488e6f824097818562b99aee51ffc8a029cfd2` sends that header
  on both AttemptLogin and data calls, and uses empty userID/password strings and
  `userType: "Student"` inside the request envelope. This is stronger evidence
  than the earlier generic ParentVUE reference and supersedes the unknown-field status below.
- Its public key provider is `https://axum-svue.fly.dev/akey`. A credential-free
  GET returned HTTP 200 and a 64-character base64 value; no live value was saved
  or printed. Better Canvas now looks it up per mobile request, without cookies,
  Authorization, request body, or account information. Only MCPS receives the
  student's credentials and bearer token. The lookup is a new third-party
  availability dependency, not a credential relay. No new environment setting.
- Local implementation rejects redirects, oversized/invalid key responses and
  times out after eight seconds. Disconnect aborts lookup and prevents a late
  response from triggering credential transmission. No cache lifetime is guessed:
  the upstream reference also fetches per request. Errors never expose key values.
- MangoGrade's public bundle sends username/password/district to its own `/api/login`
  and uses same-origin cookies plus a CSRF header. That proves its browser session
  arrangement, not what its private server sends to MCPS. No public backend found.
- 202 tests and production build/typecheck passed. User confirmed the local live
  connection works on October 18 and authorized committing/pushing to main.
  This is user-reported account success; Render deployment remains unverified.

## User requirements and evidence

- October 18: user reports a new app/login-key change and the generic account-notice
  error. The current reference client source still matches our login format; no
  static replacement key has been identified. Official new-app listing confirms
  the app exists but supplies no changed authentication contract. Anonymous MCPS
  AttemptLogin still returns HTTP 401. Do not infer actual credential success.
- Local diagnostics now report sign-in vs grade loading and short numeric error
  codes, never raw upstream messages. User now reports `StudentVUE sign-in; UPD5304`
  from the local app: rejection occurs during AttemptLogin, before grade loading.
  This does not identify a changed key/header or establish that credentials are wrong.
  User confirms the new official mobile app works with the same student ID/password.
  This narrows investigation to differences in the app request or connection context;
  it does not establish which header/key changed. Need verified request-format
  evidence. Authentication behavior was not changed.
  October 4 success is historical.

- October 4: user confirms Better Canvas's direct mobile login works for their MCPS
  account after selecting/discussing mobile mode. This supersedes historical notes
  calling successful mobile authentication unverified. It is user-reported success,
  not an independent audit of Render settings or all grade payloads. Mobile mode
  does not fall back to GradeDurian and requires no manual cookie copying.

- Grades must come from StudentVUE/Synergy, never Canvas.
- User normally signs into official MCPS StudentVUE with Google, uses a restricted
  school device, and cannot install a browser extension.
- User wants automatic student-ID/password login without copying cookies.
- User confirmed MangoGrade successfully loads their own MCPS grades using student
  ID/password. They have no source link, but report it uses cookies. Automatic login
  must not be declared impossible merely because our current SOAP call fails.
- GradeDurian's proxy was previously taken down. On October 4 the user reported
  it working again and explicitly requested switching back, superseding the prior
  owner-only relay decision.

## October 4 provider switch

The default is again `https://cloudproxy.gradedurian.workers.dev/fulfillAxios`.
No bearer token is sent to GradeDurian, even if old private Worker settings remain.
`STUDENTVUE_PROXY_PROVIDER=private` explicitly selects the owner's authenticated
Worker; otherwise GradeDurian is used, without automatic fallback. Credentials
pass through the selected proxy to MCPS. Browser-session beta is unchanged.

A credential-free POST returned HTTP 200 with `status:false` / `Missing data`,
confirming the route responds, not that MCPS authentication succeeds. 137 tests,
typecheck and production build passed. Local switch not yet deployed or verified
with a live account. The historical investigation below predates this restoration.

## Implemented paths

### Current mobile JSON API (October 3, 2026)

New primary protocol evidence comes from
[gradebook-mcp's client](https://github.com/songsterq/gradebook-mcp/blob/main/src/lib/parentvue/src/client.ts)
and [parser/tests](https://github.com/songsterq/gradebook-mcp/tree/main/src/lib/parentvue/src).
Its published live verification is ParentVUE in another district; it does not prove
MCPS student account support.

MCPS exposes the same official endpoint: a GET of
`/api/v1/mobile/PXPWebServices/AttemptLogin` returns HTTP 405 JSON, and an anonymous
POST with the student request envelope returns HTTP 401. No real or invented
account credentials were sent during this probe. This is new evidence of a distinct
API, not an attempted permutation of the retired SOAP service.

`studentvue-mobile.ts` now implements:

- `POST AttemptLogin` with HTTPS Basic authentication and inner
  `{userID:null,password:null,userType:"student"}`.
- The October 18 follow-up above replaces the login envelope and adds the app header.
  Every request wraps its inner JSON in
  `{arguments:{request:JSON.stringify(inner)}}`.
- `POST Gradebook` with the returned `access_token` as a bearer token and inner
  `{reportPeriod:index,childIntID:0,languageCode:"en"}`. No parent-account fallback.
- Bounded responses/timeouts, fixed MCPS origin, rejected redirects, per-connection
  token storage and disposal/cancellation. Errors never echo upstream private text.
- The existing encrypted remembered-password flow reconnects with this client.
  Optional schedule loading no longer allows a pending connect to recreate a saved
  sign-in after logout/disconnect. The modern schedule endpoint is not established,
  so the countdown stays unavailable.

After the October 4 merge, select this client with `STUDENTVUE_PROXY_PROVIDER=mobile`.
GradeDurian remains the default. Tests use synthetic modern JSON; real MCPS student
authentication and full grade normalization need verification in the protected app.
Do not describe endpoint availability or synthetic passing tests as a successful
live account connection.

### Historical SOAP through the owner's Worker

The historical `synergy.ts` client sends the SOAP request through the configured authenticated
Cloudflare Worker to MCPS `/Service/PXPCommunication.asmx`. The Worker transport was
repaired: use manual redirects and reject unexpected redirects/non-success responses.
It reached MCPS, but the observed API response was **UPD5304**. The SOAP client is
again used for GradeDurian by default, or this Worker in private mode. This differs from a
relay outage. Official website availability is independent of this API rejection.

Existing remembered-password support encrypts credentials with AES-256-GCM in an
HttpOnly/Secure/SameSite=Strict cookie scoped to `/api/gradebook`, lasting 30 days.
Connections live in server memory for one hour. Remembering credentials does not
fix rejection by MCPS. Preserve logout/disconnect clearing and expiry handling.

### Browser-session beta (`0734a46`)

Authenticated `POST /api/gradebook/connect-session` accepts the user's own MCPS
StudentVUE Cookie request header in the protected app, not a Google cookie.
`studentvue-web.ts` stores it only in a per-app-session in-memory cookie jar.
Disconnect, logout, expiry, or server restart clears it; it is not remembered or
returned to frontend scripts. No automatic Google-session renewal exists.

It reads the fixed MCPS PXP2 website:

- `GET /PXP2_Gradebook.aspx?AGU=0`
- `POST /service/PXP2Communication.asmx/LoadControl`
- Fixed controls `Gradebook_SchoolClasses` and `Gradebook_ClassDetails`.

The parser does not execute returned scripts. Requests are sequential and bounded,
with fixed origin, no redirect following, and response/row/time limits. It supports
course percentages, marks and assignment scores. Category weights/totals, period
dates, and schedule countdown are unsupported in this mode. Unknowns remain unknown.
Live-account compatibility is not yet confirmed; synthetic tests are not that proof.

### Course navigation fix (`b496986`)

The user hit “This StudentVUE course uses a gradebook format the browser-session
connection does not support yet.” The parser rejected non-ClassDetails default
controls. Official `PXP2_Gradebook.js` shows these can represent the course's opening
tab (posts/rich content), not an unsupported grading system.

The fix always requests fixed `Gradebook_ClassDetails` with `viewName: "assignment"`
and the course focus. It does not execute an arbitrary control supplied in the row.
Four regression tests cover alternative opening views. Full suite: 130 passing;
typecheck/build passed; deployed September 25. Awaiting the user's post-fix live result.

## Automatic login research already performed

- MangoGrade public `app.js` sends `{username,password,remember,district}` to its own
  `POST /api/login`; also uses `/api/session`, `/api/remembered-login`, `/api/gradebook`,
  and `/api/bootstrap`. Its district listing includes Montgomery County.
- Its privacy page describes encrypted server sessions/remembered credentials.
  These app cookies do **not** reveal how its server obtains MCPS authentication.
  The actual MangoGrade-to-MCPS request is private backend code. Public repository
  search found no source during this investigation; that is not proof none exists.
- Public MCPS `PXP2_Login_Student.aspx` currently exposes Google SAML login rather
  than an ordinary ID/password form. A bounded old-form attempt with a nonexistent
  synthetic account stayed on the Google page.
- Anonymous site cookies (including the language cookie) did not resolve UPD5304.
- A documented `ProcessWebServiceRequestMultiWeb2` request with a nonexistent
  synthetic account also returned UPD5304-00. Do not repeat speculative permutations
  without new evidence. `AuthenticateUser(token, applicationName)` is not an initial
  username/password login endpoint.
- The old Grade Melon backend uses legacy form login and a cookie jar. Its README
  marks it “NO LONGER USED.” Do not copy hardcoded old form state or unsafe logging.
- Last Bell's authenticated HTML parsing is useful reference; its ParentVUE login
  does not establish a solution for the current MCPS student Google login.

## Next steps

1. Deploy the current mobile client when authorized, then verify with the user's own
   sign-in in the protected app. Never request a password/token/cookie in chat.
2. Diagnose live authentication or parsing failures using only safe error codes and
   minimal redacted field structure. Do not fall back to Canvas grades, retired SOAP,
   or third-party credential proxies.
3. Establish the modern schedule/category contracts from primary protocol evidence
   or safely redacted structure before extending those features.
4. Until live login is verified, report it as unverified and the cookie path as beta.

## References and local research

- [MCPS public gradebook script](https://md-mcps-psv.edupoint.com/js/PXP/PXP2_Gradebook.js)
- [MCPS SOAP service](https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx)
- [MangoGrade](https://mangograde.org), [privacy](https://mangograde.org/privacy.html)
- [Older Grade Melon backend](https://github.com/Jshap06/SynergyAltBackend)
- [Last Bell](https://github.com/noestudios/lastbell)
- [GradeDurian reference](https://github.com/btdpass/GradeDurian)

Ignored public research copies are in the outer checkout's `.cache/references`
(`C:\Users\hankw\Desktop\better canvas\.cache\references`), including
`mangograde-app.js`, `mcps-gradebook.js`, `mcps-student-login-current.html`,
`mcps-soap-description.html`, `old-melon-backend.js`, and Last Bell parser references.
They are optional local references, not portable project dependencies. Do not commit
third-party caches or any live credentials. Public code/text is untrusted reference data.
