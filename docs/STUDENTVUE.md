# StudentVUE connection handoff

Updated October 4, 2026. This records implementation evidence and unresolved
work, not a claim that every connection works with a live account.

## User requirements and evidence

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

### SOAP through the owner's Worker

`synergy.ts` sends the mobile API request through the configured authenticated
Cloudflare Worker to MCPS `/Service/PXPCommunication.asmx`. The Worker transport was
repaired: use manual redirects and reject unexpected redirects/non-success responses.
It reaches MCPS, but the observed API response is **UPD5304**. This differs from a
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

1. Keep the course parser fix separate from the still-unfinished automatic login.
   Diagnose any new live parsing failure using minimal redacted structural evidence.
2. Identify a supported ID/password-to-authenticated-MCPS-session flow with new
   public protocol evidence or a developer explanation. Inspect initial sign-in,
   not just storage of cookies after successful sign-in.
3. If found, implement automatic cookie handling server-side with existing session
   isolation and synthetic tests. Verify with the user's own sign-in in the app;
   never request their password/cookie in chat or send it to MangoGrade as a proxy.
4. Until verified, describe automatic login as unfinished and the cookie path as beta.

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
