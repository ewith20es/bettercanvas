# v1 verification

Checked September 11, 2026.

Historical snapshot only. See [PROJECT.md](../PROJECT.md) and
[CHANGELOG.md](../CHANGELOG.md) for newer verification and deployment records.

- Production build and TypeScript checks passed.
- All 21 automated tests passed: status edge cases, school-timezone boundaries/DST, Canvas pagination and retries, safe pagination origins, partial-course preservation, authentication, origin checks, session invalidation, and login rate limiting.
- The compiled server started successfully with `npm start` and served the React app, API, and PWA icons. Private API responses returned `Cache-Control: no-store, private`.
- Browser checks passed for Home, completed-work visibility, missing-work filtering, title search, assignment details, hiding/restoring a course, month navigation, the selected-day agenda, and appearance changes.
- Checked desktop and 390px phone layouts. The phone page had no horizontal overflow.
- Enabled offline storage in demo mode, stopped the compiled server, and reloaded the page. The app shell and saved assignments remained available with an explicit offline message.
- Optional WebMCP registration is feature-detected. The available browser reported no WebMCP tools, so that optional interface could not be verified.

Live MCPS token permissions, real assignment/submission responses, and installation on the user's physical phone remain to be checked. No personal Canvas token was supplied or used. The app has not been deployed to Render.
