# Private StudentVUE relay

This Worker accepts authenticated server requests at `/fulfillAxios`, forwards only to the fixed MCPS SOAP endpoint, and supports the app's Gradebook and StudentClassList methods. It never logs request bodies or credentials, follows no redirects, and bounds request size, response size and upstream fetch time. Do not add request-body logging.

## Cloudflare

The existing Worker is `studentvue-relay`, at `https://studentvue-relay.ezsmile331.workers.dev`.

Its `RELAY_TOKEN` must be stored as a Cloudflare secret, never in source code. Keep the value private and save it for the Render step. The existing secret survives script deployments.

For dashboard editing, build the JavaScript from the repository root:

```sh
npx esbuild workers/studentvue-relay/worker.ts --format=esm --target=es2022 --outfile=.cache/studentvue-relay.js
```

Paste that generated file into the Worker's editor, then deploy. Alternatively, use Wrangler with `workers/studentvue-relay/wrangler.jsonc`.

## Render

Deploy the updated Better Canvas branch, with these two server environment variables:

```text
STUDENTVUE_RELAY_URL=https://studentvue-relay.ezsmile331.workers.dev/fulfillAxios
STUDENTVUE_RELAY_TOKEN=<the same private value as Cloudflare RELAY_TOKEN>
```

Enter the token directly in Render's Environment panel, never in chat or GitHub. For local development, set the same variables in the ignored `.env`. Do not use `VITE_` prefixes. A manually configured Render service requires these settings to be entered manually; editing `render.yaml` alone does not update it.

## Check

`GET /health` returns `{ "ok": true, "service": "studentvue-relay" }` when a secret is present. It does not contact StudentVUE. A POST to `/fulfillAxios` without the correct bearer token must return 401. To verify MCPS accepts the SOAP request, connect your own account through Better Canvas after deploying the backend and setting the token.

An MCPS `UPD5304` response is distinct from a Worker outage. The relay is not a guarantee against district restrictions.
