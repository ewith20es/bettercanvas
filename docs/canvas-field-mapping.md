# Canvas field mapping

Only the authenticated token owner's active student courses are requested. All pages are read. Normalization validates the required response shape, strips unused fields, and preserves null/unknown values. Hidden course preferences apply locally; live sync currently refreshes every active course so showing a course has current data available.

| Canvas field | App field / behavior |
| --- | --- |
| assignment.id + course ID | String identifiers; composite identity in the UI |
| assignment.name | Plain-text assignment title |
| assignment.html_url | Canvas-only HTTPS link, with a known assignment URL fallback |
| assignment.due_at | Effective due date for the requesting user; no manual override merge |
| assignment.unlock_at / lock_at | Detail-panel availability dates |
| assignment.locked_for_user | Lock indicator; check Canvas for submission options |
| assignment.points_possible | Points possible; zero is preserved |
| assignment.submission_types | Distinguish online, paper, and external-tool workflows |
| submission.workflow_state | Submission state; graded alone is not submission evidence |
| submission.submitted_at | Submission evidence and timestamp |
| submission.missing / late / excused | Independent flags from Canvas |
| submission.score / grade | Student-visible grade; zero is valid |
| submission.grade_matches_current_submission | Previous-attempt grade label |
| submission.redo_request | Resubmission attention reason |
| submission.assignment_visible=false | Exclude the assignment |

An absent submission remains unknown. No individual-submission fallback is currently used; this deliberately avoids asserting non-submission until the live account response can be verified. Paper/external-tool work can appear in the action view with a check label. The service does not fetch student submission bodies, attachment content, comments, or classmate data. Any irrelevant fields returned by Canvas are stripped before app responses or caching.

Public app routes: GET /api/health, GET /api/bootstrap, POST /api/login. Protected app routes: GET /api/snapshot, POST /api/sync, POST /api/logout. Every POST requires the exact configured Origin. Canvas calls are GET only.
