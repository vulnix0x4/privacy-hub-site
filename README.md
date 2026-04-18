# privacy.whattheflip.lol

Source for an opinionated, information-first privacy hub.

- **Design doc:** [`docs/plans/2026-04-17-privacy-hub-design.md`](docs/plans/2026-04-17-privacy-hub-design.md)
- **Implementation plan:** [`docs/plans/2026-04-17-privacy-hub-implementation.md`](docs/plans/2026-04-17-privacy-hub-implementation.md)

## What this is

A privacy hub that teaches what trackers actually do, shows the visitor what their own browser is leaking, and routes them to the tools that fix each leak. Built with Astro 6 + React islands, fully self-hosted. No cookies, no analytics, no third-party scripts — not even Cloudflare Workers.

## Deployment shape

```
Internet → your-server:443 (Caddy HTTPS) → WireGuard → this-host (mini PC) → Docker compose stack
```

- `web` — Astro Node server, port `${WEB_PORT:-8421}` on this host
- `scanner-ja4` (Phase 3) — Go handler reading raw TLS ClientHello for JA4 fingerprint; needs **TCP passthrough** on your upstream Caddy
- `scanner-nsd` (Phase 3) — NSD authoritative DNS for `*.scan.privacy.whattheflip.lol`; needs **public port 53 UDP+TCP** DNAT-forwarded to this host
- `scanner-nonce` (Phase 3) — Go sidecar coordinating nonces + NSD zone rewrites

DNS records live on Cloudflare (grey-cloud only — CF never proxies traffic, just resolves names).

See [`docs/ops/upstream-caddy.md`](docs/ops/upstream-caddy.md) for the exact
upstream Caddyfile snippets (including the `layer4` plugin build) and the
iptables DNAT rules needed to expose the DNS and JA4 endpoints.

## Local development

```bash
npm install
npm run dev       # astro dev on http://localhost:4321
```

## Deploy (on the mini PC)

```bash
cp .env.example .env   # adjust ports if conflicting with other services
docker compose up -d --build
```

Then your upstream Caddy on the public-facing server reverse-proxies `privacy.whattheflip.lol` to the WireGuard address of this mini PC on `${WEB_PORT}`.

## Stack

Astro 6 · React 19 · TypeScript 5 · Tailwind CSS v4 · Motion v12 · MDX · Pagefind · `@astrojs/node` · Docker · Caddy (upstream, not bundled) · Go (scanner backend) · NSD (authoritative DNS) · self-hosted WOFF2 fonts · zero third-party scripts

See `docs/plans/` for full detail.

## IndexNow

Bing/Yandex/Seznam/Naver accept `IndexNow` pings for instant reindex of changed URLs. The key file is already published at
`public/c7aa43b8abe34668bf459415f270fd97.txt`, so the key proves domain ownership. After a deploy, submit changed URLs with:

```bash
# Uncomment in CI after a build that ships new/changed content.
# curl -sS -X POST 'https://api.indexnow.org/IndexNow' \
#   -H 'Content-Type: application/json' \
#   -d '{
#     "host": "privacy.whattheflip.lol",
#     "key": "c7aa43b8abe34668bf459415f270fd97",
#     "keyLocation": "https://privacy.whattheflip.lol/c7aa43b8abe34668bf459415f270fd97.txt",
#     "urlList": [
#       "https://privacy.whattheflip.lol/en/",
#       "https://privacy.whattheflip.lol/en/scan"
#     ]
#   }'
```

The placeholder is intentional; when a deploy workflow lands in `.github/workflows/`, this block moves there and gets un-commented.
