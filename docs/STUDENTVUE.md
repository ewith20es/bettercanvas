# StudentVUE connection handoff

Updated October 3, 2026. This records implementation evidence and unresolved
work, not a claim that every connection works with a live account.

## User requirements and evidence

- Grades must come from StudentVUE/Synergy, never Canvas.
- User normally signs into official MCPS StudentVUE with Google, uses a restricted
  school device, and cannot install a browser extension.
- User wants automatic student-ID/password login without copying cookies.
- User confirmed MangoGrade successfully loads their own MCPS grades using student
  ID/password. They have no source link, but report it uses cookies. Automatic login
  must not be declared impossible merely because our current SOAP call fails.
- GradeDurian's owners took down its proxy. Do not restore that dependency.

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
- Every request wraps its inner JSON in
  `{arguments:{request:JSON.stringify(inner)}}`.
- `POST Gradebook` with the returned `access_token` as a bearer token and inner
  `{reportPeriod:index,childIntID:0,languageCode:"en"}`. No parent-account fallback.
- Bounded responses/timeouts, fixed MCPS origin, rejected redirects, per-connection
  token storage and disposal/cancellation. Errors never echo upstream private text.
- The existing encrypted remembered-password flow reconnects with this client.
  Optional schedule loading no longer allows a pending connect to recreate a saved
  sign-in after logout/disconnect. The modern schedule endpoint is not established,
  so the countdown stays unavailable.

The app's student ID/password route now uses this client directly. Worker settings
are no longer required or read. Tests use synthetic modern JSON; real MCPS student
authentication and full grade normalization need verification in the protected app.
Do not describe endpoint availability or synthetic passing tests as a successful
live account connection.

### Historical SOAP through the owner's Worker

The historical `synergy.ts` client sends the SOAP request through the configured authenticated
Cloudflare Worker to MCPS `/Service/PXPCommunication.asmx`. The Worker transport was
repaired: use manual redirects and reject unexpected redirects/non-success responses.
It reached MCPS, but the observed API response was **UPD5304**. App routes no longer
call this client. This differs from a
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
