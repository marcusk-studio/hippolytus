# Launcher CDN Worker

Cloudflare Worker that serves the launcher's self-update feed and release
artifacts from the `launcherbinaries` R2 bucket at `https://cdn.marcuskstudio.live`.

## Why this exists

Every shipped launcher (v1.12.0+) has the updater endpoint
`https://cdn.marcuskstudio.live/update-manifest.json` compiled into it
(`apps/app/tauri-release.conf.json`), and the release pipeline uploads the
manifest + artifacts to the `launcherbinaries` R2 bucket with a public base URL
of `https://cdn.marcuskstudio.live` (`.github/workflows/release-build.yml`).

That hostname is a Cloudflare-routed alias for the bucket. When the
`marcuskstudio.live` domain lapsed the route was lost, so `update-manifest.json`
became unreachable (NXDOMAIN) and every installed launcher silently stopped
self-updating. This worker re-establishes the route as code so it cannot be lost
again, and lets us control caching (short for the manifest, immutable for
artifacts).

**The route pattern must stay exactly `cdn.marcuskstudio.live/*`** — it is
hard-wired into already-installed binaries and cannot be changed without
orphaning the existing user base.

## Request handling

- `/update-manifest.json` — the Tauri updater manifest, served from the bucket
  root. Short-cached (`MANIFEST_CACHE_CONTROL`) so new releases are picked up
  promptly.
- `/releases/<version>/…` — platform bundles and signatures. Immutable,
  long-cached (`BLOB_CACHE_CONTROL`).
- `GET` and `HEAD` are both supported (the updater issues a `HEAD` to size the
  download); everything else returns `405`. Unknown keys return `404`.

Request paths map 1:1 to R2 object keys, URL-decoded per segment (the manifest
percent-encodes spaces in filenames), with `..` and embedded slashes rejected.

## Bindings and vars

- R2 binding: `LAUNCHER_BUCKET` -> `launcherbinaries`
- `MANIFEST_CACHE_CONTROL` (default: `public, max-age=30, must-revalidate`)
- `BLOB_CACHE_CONTROL` (default: `public, max-age=31536000, immutable`)

## Deploy

From this directory:

```sh
npx wrangler deploy
```

GitHub Actions deploy uses `.github/workflows/deploy-launcher-cdn-worker.yml`
and expects repository secrets:

- `CLOUDFLARE_API_TOKEN` with least-privilege account permissions:
  - `Workers Scripts:Edit`
  - `Workers Scripts:Read`
  - `Workers Routes:Edit` (the route `cdn.marcuskstudio.live/*` is managed in
    `wrangler.toml`)
- `CLOUDFLARE_ACCOUNT_ID` (already configured for the R2 upload steps)

Prefilled token page (account `fa3f91b1ed2a3fcde39345772d131913` — switch the
account in the dropdown if the `launcherbinaries` bucket / `marcuskstudio.live`
zone live elsewhere):

- https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=fa3f91b1ed2a3fcde39345772d131913&zoneId=all&name=launcher-cdn-worker-deploy

The `launcherbinaries` bucket must live in the same Cloudflare account as the
token, and the `marcuskstudio.live` zone must be active on that account for the
route to bind.
