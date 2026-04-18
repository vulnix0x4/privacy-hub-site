# Privacy Hub — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `privacy.whattheflip.lol` — an Astro 6 privacy hub with a 22-vector live fingerprint scanner, Ghost Demo hero, 22 encyclopedia entries, 22 category pages, 11 scenarios, 25 guides, and a separate hardened scanner-backend VPS — with zero client-side tracking and architecturally-verifiable no-retention on the scanner.

**Architecture:** Static-first Astro 6 deployed to Cloudflare Workers via `@astrojs/cloudflare`; React islands only for `/scan` scanner and Ghost Demo hero. Cloudflare KV holds 60-second scan nonces. A separate Hetzner Helsinki VPS (grey-cloud DNS) runs Caddy + a Go JA4 handler + NSD for the DNS-leak test — NSD chosen because it has no query-log subsystem at all. Content lives as MDX validated by Zod-schema Content Collections; CI gates on `last_verified`, related-entry count, and "zero third-party fetches."

**Tech Stack:** Astro 6 · React 19 (islands) · TypeScript ≥5.4 · Tailwind v4 · Motion v12 · Pagefind · Lucide · self-hosted WOFF2 · Cloudflare Workers + KV · `@astrojs/cloudflare` adapter · Hetzner CAX11 VPS · Caddy · Go · NSD · systemd · GitHub Actions

**Source of truth:** all decisions in this plan trace to [2026-04-17-privacy-hub-design.md](2026-04-17-privacy-hub-design.md). When in doubt, that doc wins.

---

## Phase structure

Work is partitioned into 13 phases. Phases 0-2 are strictly sequential. After Phase 2, three workstreams run in parallel: **A** (scanner VPS), **B** (site scaffold + schemas), **C** (scanner client + Ghost Demo). Phase 7+ is content production. Phase 12 converges on launch verification.

| Phase | Name | Runs after | Parallel-safe with |
|---|---|---|---|
| 0 | Repos + local environment | — | — |
| 1 | Astro project init + Cloudflare config | 0 | — |
| 2 | Design system shell | 1 | — |
| 3 | **Workstream A**: Scanner VPS (Hetzner + Caddy + Go + NSD) | 0 | B, C, 7 |
| 4 | **Workstream B**: Content Collections schemas + CI gates | 2 | A, C |
| 5 | **Workstream C**: Scanner client island (22 vector probes + UI) | 2 | A, B |
| 6 | Ghost Demo island | 2 | A, B, 5 |
| 7 | Content Wave 1 — Structural Launchable | 4 | A, C (post-schema) |
| 8 | Content Wave 2 — Guides Full | 4 | A, C |
| 9 | Content Wave 3 — Deepening | all above | — |
| 10 | Legal + About pages | 4 | C |
| 11 | SEO primitives (sitemap, OG, JSON-LD, IndexNow) | 4 | — |
| 12 | Launch verification (Lighthouse, pa11y, no-third-party, attestation) | 3, 5, 6, 7, 8, 10, 11 | — |
| 13 | Ship + post-launch Wave 3 | 12 | — |

---

# Phase 0: Repos + local environment

## Task 0.1: Initialize the site repository

**Files:**
- Create: `C:/Users/vulnix0x4/protondrive/My files/Projects/privacy/README.md`
- Create: `C:/Users/vulnix0x4/protondrive/My files/Projects/privacy/.gitignore`

**Step 1:** Verify working directory is empty except for `docs/plans/`.
```bash
ls -la
```
Expected: only `docs/` dir.

**Step 2:** Initialize git.
```bash
git init
git branch -m main
```
Expected: initializes empty repo on `main`.

**Step 3:** Write baseline `.gitignore`:
```
node_modules/
dist/
.astro/
.wrangler/
.env
.env.local
.DS_Store
Thumbs.db
*.log
.vscode/
.idea/
```

**Step 4:** Write minimal `README.md`:
```markdown
# privacy.whattheflip.lol

Source for the privacy hub. Design doc: `docs/plans/2026-04-17-privacy-hub-design.md`.

Scanner backend lives in a separate public repo: TBD.
```

**Step 5:** Stage + commit.
```bash
git add .gitignore README.md docs/plans/2026-04-17-privacy-hub-design.md docs/plans/2026-04-17-privacy-hub-implementation.md
git commit -m "chore: initial repo with design and implementation plans"
```

## Task 0.2: Create public GitHub repo and push

**Step 1:** Create the remote.
```bash
gh repo create privacy-hub-site --public --description "privacy.whattheflip.lol — opinionated privacy hub"
```
Expected: prints new repo URL.

**Step 2:** Set remote + push.
```bash
git remote add origin git@github.com:<owner>/privacy-hub-site.git
git push -u origin main
```

**Step 3:** Enable branch protection on `main` (GitHub UI or API):
- Require PR, require status checks, require signed commits.

## Task 0.3: Create the scanner-backend repo skeleton

**Step 1:** Create empty directory locally for the other repo:
```bash
mkdir -p ../privacy-hub-scanner
cd ../privacy-hub-scanner
git init && git branch -m main
```

**Step 2:** Baseline `README.md`:
```markdown
# privacy-hub-scanner

Backend for the live scanner at privacy.whattheflip.lol/scan.

Architecturally logs nothing. Configs in this repo ARE the no-retention
claim — read them before trusting us.

- `caddy/Caddyfile` — reverse proxy, access_log off by default
- `handler/` — Go handler computing JA4 from raw TLS ClientHello
- `nsd/` — NSD authoritative config for *.scan.privacy.whattheflip.lol
- `systemd/` — hardened unit files (StandardOutput=null, tmpfs /var/log)
- `provision/provision.sh` — idempotent bootstrap for a fresh Hetzner CAX11
- `attestations/` — quarterly asciinema recordings of the prod box
```

**Step 3:** Add `.gitignore`:
```
bin/
*.log
.env
```

**Step 4:** Commit + push:
```bash
git add . && git commit -m "chore: scanner-backend repo skeleton"
gh repo create privacy-hub-scanner --public --source=. --push
```

---

# Phase 1: Astro project init + Cloudflare config

## Task 1.1: Scaffold Astro 6 with React + Tailwind + Cloudflare adapter

**Files (auto-created by Astro):**
- `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`, etc.

**Step 1:** Scaffold (cwd = site repo root):
```bash
npm create astro@latest -- --template minimal --typescript strict --install --git false --yes .
```

**Step 2:** Add integrations:
```bash
npx astro add react tailwind mdx cloudflare
```
Expected: `astro.config.mjs` ends up with all 4 integrations; `package.json` has `@astrojs/react`, `@astrojs/tailwind`, `@astrojs/mdx`, `@astrojs/cloudflare`.

**Step 3:** Pin dependency versions. Edit `package.json`, set (minimum):
- `"astro": "^6"`
- `"react": "^19"` and `"react-dom": "^19"`
- `"@astrojs/react": "^5"` (or current v6-compat)
- `"@astrojs/cloudflare": "^12"` (or current)
- `"motion": "^12"`
- `"lucide-react": "^0.460.0"`

**Step 4:** `npm install` then `npm run dev` — verify localhost:4321 renders "Astro".

**Step 5:** Commit:
```bash
git add .
git commit -m "feat: Astro 6 scaffold with React, Tailwind, MDX, Cloudflare adapter"
```

## Task 1.2: Configure Astro for output and sitemap

**Files:**
- Modify: `astro.config.mjs`

**Step 1:** Set `output: 'static'` initially (we go server-render only for scanner API routes later):
```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://privacy.whattheflip.lol',
  output: 'hybrid',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react(), tailwind({ applyBaseStyles: false }), mdx(), sitemap()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    routing: { prefixDefaultLocale: true },
  },
});
```

**Step 2:** Install sitemap integration: `npx astro add sitemap`.

**Step 3:** Verify `npm run build` produces a `dist/` with `sitemap-index.xml` and `sitemap-0.xml`.

**Step 4:** Commit: `git commit -am "feat: Astro config with hybrid output, sitemap, /en locale prefix"`.

## Task 1.3: wrangler.jsonc with observability disabled

**Files:**
- Create: `wrangler.jsonc`

**Step 1:** Write the file (copy-paste exactly):
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "privacy-hub",
  "main": "./dist/_worker.js/index.js",
  "compatibility_date": "2026-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": false
  },
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": false
  },
  "kv_namespaces": [
    { "binding": "SCAN_NONCES", "id": "REPLACE_AFTER_CREATE" }
  ]
}
```

**Step 2:** Create the KV namespace via Cloudflare MCP or `wrangler kv:namespace create SCAN_NONCES`; replace `REPLACE_AFTER_CREATE` with the returned id.

**Step 3:** Verify `observability.enabled` via `wrangler deployments list` after first deploy — must not show observability enabled.

**Step 4:** Commit: `git commit -am "feat: wrangler.jsonc with observability disabled and KV binding"`.

## Task 1.4: CI workflow scaffold

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1:** Write minimal workflow:
```yaml
name: Deploy
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: true }
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20.9.0', cache: npm }
      - run: npm ci
      - run: npm run astro -- check
      - run: npm run build
      - run: npx pagefind --site dist
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist }
  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20.9.0', cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npx pagefind --site dist
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

**Step 2:** Add repo secret `CLOUDFLARE_API_TOKEN` (GitHub UI → Settings → Secrets).

**Step 3:** Commit + push. Verify CI runs green.

---

# Phase 2: Design system shell

## Task 2.1: Tailwind v4 theme tokens

**Files:**
- Create: `src/styles/global.css`
- Modify: `src/layouts/Layout.astro` (to come in next task)

**Step 1:** Write `src/styles/global.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg: #0a0a0a;
  --color-surface: #141416;
  --color-text: #f5f5f5;
  --color-text-muted: #9ca3af;
  --color-accent: #22c55e;
  --color-state-unchanged: #ef4444;
  --color-state-spoofed: #22c55e;
  --color-state-farbled: #22c55e;
  --color-state-quantized: #a855f7;
  --color-state-blocked: #3b82f6;
  --color-state-info: #9ca3af;

  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

@media (prefers-color-scheme: light) {
  @theme { /* light overrides — fill during design pass */ }
}

:root { color-scheme: dark light; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 4px; }

.sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
```

**Step 2:** Commit: `git commit -am "feat: Tailwind v4 theme tokens and a11y primitives"`.

## Task 2.2: Self-hosted fonts

**Files:**
- Create: `public/fonts/Inter-Variable.woff2`, `public/fonts/JetBrainsMono-Variable.woff2`
- Modify: `src/styles/global.css`

**Step 1:** Download Inter-Variable.woff2 and JetBrainsMono-Variable.woff2 from their official GitHub releases (not Google Fonts — download to your machine, commit as binary).

**Step 2:** Add `@font-face` to `global.css`:
```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Variable.woff2") format("woff2-variations");
  font-weight: 100 900; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/JetBrainsMono-Variable.woff2") format("woff2-variations");
  font-weight: 100 800; font-style: normal; font-display: swap;
}
body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-text); }
code, pre, .mono { font-family: var(--font-mono); }
```

**Step 3:** Commit: `git commit -am "feat: self-hosted Inter + JetBrains Mono WOFF2"`.

## Task 2.3: Root layout with skip-link, nav, footer

**Files:**
- Create: `src/layouts/Layout.astro`

**Step 1:** Write the layout:
```astro
---
import '../styles/global.css';
interface Props { title: string; description: string; }
const { title, description } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <link rel="canonical" href={Astro.url.href} />
    <link rel="alternate" hreflang="en" href={Astro.url.href} />
  </head>
  <body>
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
    <header><!-- nav goes here --></header>
    <main id="main"><slot /></main>
    <footer class="mt-16 border-t border-white/10 py-8 text-sm text-text-muted">
      <p>This is not legal advice. We don't use cookies, analytics, or third-party scripts.</p>
      <nav aria-label="Legal"><a href="/en/legal/privacy">Privacy</a> · <a href="/en/legal/affiliate">Affiliate</a> · <a href="/en/legal/accessibility">Accessibility</a> · <a href="/en/legal/dmca">DMCA</a></nav>
    </footer>
  </body>
</html>
```

**Step 2:** Add a test stub page at `src/pages/en/index.astro` importing the layout. `npm run dev`, verify skip-link tab order works.

**Step 3:** Commit: `git commit -am "feat: root layout with skip-link, hreflang, footer legal nav"`.

## Task 2.4: Reduced-motion MotionConfig provider

**Files:**
- Create: `src/components/islands/ReducedMotionProvider.tsx`

**Step 1:** Write the provider:
```tsx
import { MotionConfig, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const prefersReduce = useReducedMotion();
  return (
    <MotionConfig reducedMotion={prefersReduce ? 'always' : 'never'} transition={{ duration: prefersReduce ? 0 : 0.2 }}>
      {children}
    </MotionConfig>
  );
}
```

**Step 2:** Commit: `git commit -am "feat: ReducedMotionProvider wrapping all React islands"`.

---

# Phase 3 — Workstream A: Scanner VPS (can start after Phase 0)

All of Phase 3 runs on a fresh Hetzner CAX11 (ARM, 4 GB, 40 GB NVMe, Helsinki) with Ubuntu 24.04 LTS. Every file listed lives in the `privacy-hub-scanner` repo created in Task 0.3.

## Task 3.1: Provision the Hetzner VPS

**Step 1:** Via Hetzner Cloud console or `hcloud` CLI, create CAX11 in Helsinki with Ubuntu 24.04. Add your SSH key. Note the IP.

**Step 2:** SSH in, create an `ops` user with sudo, disable root password login in `/etc/ssh/sshd_config` (`PermitRootLogin no`, `PasswordAuthentication no`).

**Step 3:** Enable ufw, allow 22/80/443, deny default.
```bash
ufw default deny incoming
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 53/tcp && ufw allow 53/udp
ufw --force enable
```

**Step 4:** Point grey-cloud Cloudflare DNS records to this IP:
- `ja4.scan.privacy.whattheflip.lol`  A → VPS IPv4
- `ns1.scan.privacy.whattheflip.lol`  A → VPS IPv4
- `*.scan.privacy.whattheflip.lol`    NS → `ns1.scan.privacy.whattheflip.lol`

**Step 5:** Commit provisioning notes to `provision/README.md` in scanner repo.

## Task 3.2: Harden systemd/journald for no-retention

**Files:**
- Create: `systemd/journald-volatile.conf` (scanner repo)

**Step 1:** On the VPS, edit `/etc/systemd/journald.conf.d/privacy.conf`:
```ini
[Journal]
Storage=volatile
RuntimeMaxUse=32M
RuntimeMaxFiles=3
```

**Step 2:** Mount `/var/log` as tmpfs — edit `/etc/fstab`:
```
tmpfs  /var/log  tmpfs  defaults,noatime,size=64M  0 0
```

**Step 3:** Reboot; verify:
```bash
mount | grep '/var/log'       # must show tmpfs
journalctl --no-pager | wc -l # should be tiny
```

**Step 4:** Commit the `systemd/journald-volatile.conf` to scanner repo; mirror the fstab note in `provision/README.md`.

## Task 3.3: Install and configure Caddy

**Files:**
- Create: `caddy/Caddyfile` (scanner repo)
- Create: `systemd/caddy-override.conf` (scanner repo)

**Step 1:** Install Caddy 2.x from the official apt repo.

**Step 2:** Write `caddy/Caddyfile`:
```
{
    admin off
    auto_https disable_redirects
    log default {
        output discard
    }
}

ja4.scan.privacy.whattheflip.lol {
    log_skip
    reverse_proxy /echo unix//run/ja4-handler.sock
    respond / "OK" 200
}
```

**Step 3:** Write `systemd/caddy-override.conf` and `systemctl edit caddy.service` to install:
```ini
[Service]
StandardOutput=null
StandardError=null
ProtectSystem=strict
ReadOnlyPaths=/etc/caddy
```

**Step 4:** `systemctl restart caddy`; visit `https://ja4.scan.privacy.whattheflip.lol/` → 200 OK. `journalctl -u caddy` must show startup only, no per-request lines.

**Step 5:** Commit the Caddyfile + override to scanner repo.

## Task 3.4: Go JA4 handler (TDD)

**Files:**
- Create: `handler/ja4.go`, `handler/ja4_test.go`, `handler/go.mod`, `handler/main.go`

**Step 1: Write failing test** — `handler/ja4_test.go`:
```go
package handler
import ( "bytes"; "testing" )

func TestJA4FromChromeClientHello(t *testing.T) {
    // fixture: captured Chrome 129 ClientHello bytes
    raw := chromeClientHelloFixture()
    got, err := ComputeJA4(bytes.NewReader(raw))
    if err != nil { t.Fatal(err) }
    want := "t13d1516h2_8daaf6152771_b0da82dd1658"
    if got != want { t.Fatalf("got %q, want %q", got, want) }
}
```
(Fixture bytes captured via `openssl s_client -debug` or a Wireshark dump. Commit the fixture as `handler/testdata/chrome_ch.bin`.)

**Step 2:** `go test ./handler` → FAIL.

**Step 3: Implement** `handler/ja4.go` using FoxIO's JA4 spec (BSD 3-Clause). Reference: https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md. Implement protocol byte (`t`), TLS version map, SNI flag, cipher-count, extension-count, ALPN, sorted-cipher-SHA256 prefix, extension-SHA256 prefix.

**Step 4:** `go test ./handler` → PASS.

**Step 5:** Implement `handler/main.go` — Unix-socket HTTP server on `/run/ja4-handler.sock` exposing `GET /echo` that reads the raw TLS ClientHello from the TLS connection exposed by Caddy's `X-JA4-Raw-ClientHello` header (or switches to reading the TLS handshake from an haproxy PROXY-protocol layer if Caddy-TLS-passthrough is needed).

> **Caveat:** Caddy does not natively forward raw ClientHello to the upstream. The simplest approach: **run the Go handler as Caddy-replacement on port 443** and embed the Go net/http TLS listener; use `conn.(*tls.Conn).ConnectionState()` — but `ConnectionState` doesn't expose extension order. Use `crypto/tls` with a custom `GetConfigForClient` callback or the `uTLS` package (not needed for server-side) to capture the raw handshake. Simpler path: use `golang.org/x/net/http2` + a TCP-level accept + read the first ~4 KB before handing to `tls.Server`, parse the ClientHello ourselves, then wrap for TLS termination. This is the one non-trivial bit of Go on this VPS.

**Step 6:** `go build -trimpath -ldflags="-buildid= -s -w" -o bin/ja4-handler ./handler`. Record SHA-256:
```bash
sha256sum bin/ja4-handler > bin/ja4-handler.sha256
```

**Step 7:** Commit all handler sources including `bin/ja4-handler.sha256`.

## Task 3.5: systemd unit for the JA4 handler

**Files:**
- Create: `systemd/ja4-handler.service` (scanner repo)

**Step 1:** Write the unit:
```ini
[Unit]
Description=JA4 handler
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ja4-handler
User=ja4
Group=ja4
RuntimeDirectory=ja4-handler
StandardOutput=null
StandardError=null
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
```

**Step 2:** Deploy: copy binary to `/usr/local/bin/ja4-handler`, create user `ja4`, enable + start unit.

**Step 3:** Verify `journalctl -u ja4-handler` shows only "Started" — no per-request logs.

**Step 4:** Commit.

## Task 3.6: NSD authoritative for *.scan.privacy.whattheflip.lol

**Files:**
- Create: `nsd/nsd.conf`, `nsd/scan.zone`

**Step 1:** Install NSD. Write `/etc/nsd/nsd.conf`:
```
server:
  server-count: 1
  tcp-count: 8
  verbosity: 0
  username: nsd
  zonesdir: "/etc/nsd/zones"
  port: 53

zone:
  name: "scan.privacy.whattheflip.lol"
  zonefile: "scan.zone"
```

**Step 2:** Write `/etc/nsd/zones/scan.zone`:
```
$ORIGIN scan.privacy.whattheflip.lol.
$TTL 60
@  IN  SOA  ns1.scan.privacy.whattheflip.lol. ops.privacy.whattheflip.lol. (
            2026041700 ; serial (rewritten by sidecar)
            600 60 604800 60 )
   IN  NS   ns1.scan.privacy.whattheflip.lol.
ns1 IN A   <VPS_IPV4>
*  IN  A   127.0.0.2  ; default wildcard; nonce records added dynamically
```

**Step 3:** `systemctl enable --now nsd`; `dig @127.0.0.1 test.scan.privacy.whattheflip.lol` should resolve to 127.0.0.2.

**Step 4:** Verify no NSD query logs exist: `ls /var/log/nsd*` — should be empty or directory absent.

**Step 5:** Commit `nsd/nsd.conf` + `nsd/scan.zone` template.

## Task 3.7: Nonce-sidecar Go service

**Files:**
- Create: `sidecar/main.go`, `sidecar/main_test.go`, `sidecar/go.mod`
- Create: `systemd/nonce-sidecar.service`

**Step 1 — Test:** write `sidecar/main_test.go` that asserts: given a nonce `abc123` posted to the sidecar, a subsequent `dig abc123.scan.privacy.whattheflip.lol` returns a unique A record, and that after 60 seconds the record is gone.

**Step 2 — Implement:** small Go service that listens on Unix socket, maintains an in-memory `map[nonce]time.Time`, on each tick (5s) rewrites `/etc/nsd/zones/scan.zone` with current valid nonces and `nsd-control reload`. On receipt of a nonce with `TTL=60s`, it fetches from CF KV via the CF REST API using an API token scoped to the KV namespace (token stored in `/etc/nonce-sidecar.env`, `EnvironmentFile=` in the unit).

**Step 3:** Run test → PASS.

**Step 4:** Build with same reproducible flags, commit SHA-256.

**Step 5:** Deploy, enable unit. Verify.

**Step 6:** Commit.

## Task 3.8: provision.sh — idempotent bootstrap

**Files:**
- Create: `provision/provision.sh`

**Step 1:** Write a single Bash script that, run against a fresh Ubuntu 24.04 box, applies: ufw rules, user creation, tmpfs `/var/log` fstab + journald conf, Caddy + NSD installation, binaries into `/usr/local/bin/`, systemd units enabled. Every step is idempotent (checks before creating).

**Step 2:** Dry-run test: provision a second throwaway CAX11 from the script, verify it reaches the same state.

**Step 3:** Commit + tag `v0.1.0-infra`.

## Task 3.9: First attestation

**Files:**
- Create: `attestations/2026-04-20.cast` (approximate date; actual launch-adjacent)

**Step 1:** `asciinema rec attestations/$(date +%Y-%m-%d).cast` and run: `journalctl --no-pager | wc -l`, `ls -la /var/log`, `mount | grep tmpfs`, `systemctl status caddy nsd ja4-handler nonce-sidecar`, `sha256sum /usr/local/bin/ja4-handler /usr/local/bin/nonce-sidecar`.

**Step 2:** Commit the `.cast` + push; link from the design doc's `/en/about/scanner-privacy` in Phase 10.

---

# Phase 4 — Workstream B: Content Collections schemas + CI gates

## Task 4.1: Define Zod schemas for each content type

**Files:**
- Create: `src/content/config.ts`

**Step 1:** Write schema (skeleton — refine as content is authored):
```ts
import { defineCollection, z } from 'astro:content';

const common = z.object({
  title: z.string().min(3),
  description: z.string().min(20).max(160),
  difficulty: z.enum(['easy', 'intermediate', 'advanced']).optional(),
  last_verified: z.coerce.date(),
  related: z.array(z.string()).min(2),
});

const vectors = defineCollection({
  type: 'content',
  schema: common.extend({
    family: z.enum(['network','fingerprint','sensors','permissions','storage','behavioral','cross-site']),
    severity: z.enum(['critical','high','medium','low']),
    prevalence: z.enum(['very-common','common','rare']),
    in_scanner: z.boolean().default(true),
  }),
});

const categories = defineCollection({ type: 'content', schema: common.extend({
  hero_pick: z.string(), alternatives: z.array(z.string()).min(1),
  affiliate: z.enum(['proton','privacy-com','smspool','bitwarden','brave','kagi','obsidian','ente','none']).default('none'),
}) });

const scenarios = defineCollection({ type: 'content', schema: common.extend({
  playlist: z.array(z.object({ type: z.enum(['basics','vector','category','guide']), slug: z.string(), why: z.string() })).min(5),
  jurisdiction_note: z.string().optional(),
}) });

const guides = defineCollection({ type: 'content', schema: common.extend({
  time_minutes: z.number().int().positive(),
  prerequisites: z.array(z.string()).default([]),
}) });

const basics = defineCollection({ type: 'content', schema: common });
const glossary = defineCollection({ type: 'data', schema: z.object({ term: z.string(), definition: z.string().min(20), see_also: z.array(z.string()).default([]) }) });

export const collections = { vectors, categories, scenarios, guides, basics, glossary };
```

**Step 2:** `npx astro check` — expect zero errors (no content yet).

**Step 3:** Commit: `git commit -am "feat: Content Collections schemas for all content types"`.

## Task 4.2: Content directory structure + seed stubs

**Files:** `src/content/{vectors,categories,scenarios,guides,basics}/*.mdx`, `src/content/glossary/glossary.yaml`.

**Step 1:** Create one stub per content type just to prove the schema works:
```
src/content/vectors/canvas-fingerprinting.mdx
src/content/categories/vpn.mdx
src/content/scenarios/just-want-basics.mdx
src/content/guides/harden-firefox.mdx
src/content/basics/threat-modeling.mdx
```
Each stub has valid frontmatter matching the schema and a single placeholder paragraph.

**Step 2:** `astro check` passes. `astro build` succeeds.

**Step 3:** Commit.

## Task 4.3: CI gate — no-third-party network test

**Files:**
- Create: `scripts/test-no-third-party.mjs`
- Modify: `.github/workflows/deploy.yml`

**Step 1:** Write a Playwright test that launches each built HTML page in a headless browser and fails if any resulting request has a cross-origin hostname. Allowed origins: `privacy.whattheflip.lol`, `ja4.scan.privacy.whattheflip.lol`, `ns1.scan.privacy.whattheflip.lol`, and `self`.

**Step 2:** Run in CI after build. Fail the whole deploy if any page violates.

**Step 3:** Commit.

## Task 4.4: CI gate — island bundle size

**Files:**
- Create: `.size-limit.json`
- Modify: `.github/workflows/deploy.yml`

**Step 1:** Add `size-limit`:
```json
[
  { "path": "dist/_astro/ScannerApp*.js", "limit": "80 KB", "gzip": true },
  { "path": "dist/_astro/GhostDemo*.js", "limit": "20 KB", "gzip": true }
]
```

**Step 2:** `npm run size` step in CI.

**Step 3:** Commit.

---

# Phase 5 — Workstream C: Scanner client island

All code under `src/components/scanner/`. Each vector probe is its own TDD task.

## Task 5.1: Scanner island root

**Files:** `src/components/scanner/ScannerApp.tsx`, `src/pages/en/scan.astro`.

**Step 1:** Create `ScannerApp.tsx` stub returning an `<h1>Scanner</h1>`; wire into `scan.astro` with `client:load`.

**Step 2:** Verify island hydrates in dev. Commit.

## Task 5.2: Vector registry

**Files:** `src/components/scanner/registry.ts`

**Step 1:** Define `VectorId`, `VectorFamily`, `Severity`, and a `VECTOR_CATALOG` array with 22 entries matching design doc §5.2. Each has `{ id, family, severity, prevalence, title, encyclopediaSlug, run: () => Promise<ProbeResult> }` (probe implementations stub to `notImplemented()` here).

**Step 2:** Commit.

## Task 5.3: Stability probe runner (TDD)

**Files:** `src/components/scanner/stabilityProbe.ts`, `src/components/scanner/stabilityProbe.test.ts`

**Step 1 — Tests:**
- `3 reads same value → STABLE`
- `3 different values → JITTERED`
- `all throw/null → ABSENT`
- `single outlier retries up to 5`

**Step 2 — Implement.** `async function stabilityProbe(read: () => Promise<unknown>): Promise<'STABLE'|'JITTERED'|'ABSENT'>`.

**Step 3:** Run tests → PASS. Commit.

## Task 5.4: Defense-mode classifier (TDD)

**Files:** `src/components/scanner/classifyDefenseMode.ts`, `.test.ts`

**Step 1 — Tests:** see §5.3 of design doc. Table-drive: for each `(stability, value, family) → expected state`. Include canonical spoof-bucket table for Tor Browser, Mullvad Browser, Firefox FPP.

**Step 2 — Implement.** Six states: `UNCHANGED | SPOOFED | FARBLED | QUANTIZED | BLOCKED | INFO`.

**Step 3:** Commit.

## Task 5.5: Browser detector (TDD)

**Files:** `src/components/scanner/detectBrowser.ts`, `.test.ts`

**Step 1 — Tests** for: vanilla-chrome, brave-strict, brave-standard, firefox-etp-standard, firefox-etp-strict (FPP), firefox-rfp, librewolf, tor-browser, mullvad-browser, safari-26, edge.

**Step 2 — Implement** heuristics using UA + permissions-bitmap-shape + letterboxing signal + AudioContext compression ratios.

**Step 3:** Commit.

## Tasks 5.6.1 – 5.6.22: Individual vector probes

One task per vector. Each follows the same shape:

**Files:** `src/components/scanner/probes/<vector>.ts`, `.test.ts`

**Steps (per probe):**
1. Write vitest test describing expected output shape for a vanilla-Chrome fixture (use `happy-dom` or jsdom).
2. Run test → FAIL.
3. Implement probe using the technique from design doc §5.2 (canvas draws text + `toDataURL`; WebGL `getParameter(UNMASKED_RENDERER_WEBGL)`; audio DynamicsCompressor-sum; font measurement side-channel; etc.).
4. Run test → PASS.
5. Commit with message `feat(scanner): <vector> probe`.

Order for execution (lowest-risk first):
- 5.6.1 **User-Agent + Client Hints** (simple read)
- 5.6.2 **Navigator properties** (simple read)
- 5.6.3 **Screen / viewport**
- 5.6.4 **Timezone + language**
- 5.6.5 **Speech synthesis voices**
- 5.6.6 **Media devices** (count-only, no permission)
- 5.6.7 **Battery API** (graceful if missing)
- 5.6.8 **Permissions bitmap** (enumerate 23 names, catch per-engine differences)
- 5.6.9 **Canvas fingerprinting**
- 5.6.10 **WebGL fingerprinting**
- 5.6.11 **WebGPU** (guarded on `navigator.gpu` availability)
- 5.6.12 **AudioContext**
- 5.6.13 **Font enumeration** (measurement side-channel)
- 5.6.14 **DNS leak** (initiates fetch to `{nonce}.scan.privacy.whattheflip.lol/` after nonce issuance)
- 5.6.15 **WebRTC local IP**
- 5.6.16 **IP + geolocation** (via `/api/scan/headers` echo)
- 5.6.17 **TLS JA4** (via `fetch('https://ja4.scan.privacy.whattheflip.lol/echo')` — returns JA4 string, scan client displays)
- 5.6.18 **Third-party cookies + CHIPS**
- 5.6.19 **Supercookie probes**
- 5.6.20 **Extension detection** (`chrome-extension://<uuid>/icon.png` probes for known public extension UUIDs)
- 5.6.21 **Referrer + federated-login probes**
- 5.6.22 **CDN bot-management cookies** (inspect `document.cookie` after a fetch to known Cloudflare-fronted sites)

## Task 5.7: Cloudflare Worker /api/scan/* endpoints

**Files:** `functions/api/scan/nonce.ts`, `functions/api/scan/headers.ts`.

**Step 1 — nonce endpoint:** generates `crypto.randomUUID()`, writes to KV with `expirationTtl: 60`, returns JSON `{nonce, expiresAt}`.

**Step 2 — headers endpoint:** returns the client's request headers (Accept, Accept-Language, UA, UA-CH subset), IP from `request.headers.get('CF-Connecting-IP')`, country from `request.cf.country`. No logging, no KV write.

**Step 3 — rate-limit rule:** configure CF Advanced Rate Limiting via dashboard or `wrangler`, keyed on SHA-256 of the request body's `nonce` field. Never keyed on IP.

**Step 4:** Commit.

## Task 5.8: IndexedDB scan history

**Files:** `src/components/scanner/history.ts`, `.test.ts`

**Step 1 — Tests:** `saveScan({label, vectors}) → retrievable`, `>10 scans → FIFO evict`, `diffScans(a, b) → per-vector transition labels`.

**Step 2 — Implement** using the `idb` package (tiny, no deps).

**Step 3:** Commit.

## Task 5.9: Scanner UI — cards grid, category bar, progressive fill-in

**Files:** `src/components/scanner/ScannerCard.tsx`, `ScannerCategoryBar.tsx`, `ScannerHero.tsx`, `ScannerApp.tsx` (wire-up).

**Step 1:** Build each component with Tailwind + Motion v12 (skeleton → result transitions, reduced-motion respected).

**Step 2:** Verify tab order: category bar uses roving tabindex; cards are reachable; deep-scan modal traps focus and closes on Escape.

**Step 3:** Verify ARIA: each card has `aria-live="polite"`, `aria-busy` toggles during scan; dice icon has `aria-hidden="true"` with adjacent text label.

**Step 4:** Axe-core audit in browser → 0 violations.

**Step 5:** Commit.

## Task 5.10: Per-browser verdict templates

**Files:** `src/components/scanner/verdicts.ts`

**Step 1:** Map `browserFamily → verdictCopy(defenseModeProfile) => string` for the 11 templates in §5.5 of design doc.

**Step 2:** Unit tests ensure every browser family produces a distinct verdict for a known-input profile.

**Step 3:** Commit.

## Task 5.11: Share artifacts (PNG + JSON + fragment + embed + tweet)

**Files:** `src/components/scanner/share/*.ts`

**Step 1:** PNG generator — OffscreenCanvas-based; 1200×628; renders tally + browser.

**Step 2:** JSON exporter — downloads full scan vector.

**Step 3:** Fragment URL — base64url of SHA-256 hash of vector.

**Step 4:** Embed snippet generator — blockquote HTML.

**Step 5:** Tweet text — pre-filled message + scanner URL.

**Step 6:** Pre-flight modal listing what each artifact includes/excludes.

**Step 7:** Commit after each.

---

# Phase 6: Ghost Demo island

**Files:** `src/components/ghost-demo/GhostDemo.tsx`, subcomponents + `.test.ts`.

## Task 6.1: Client-side fingerprint hasher

**Step 1 — Test:** `await computeGhostHash() → stable SHA-256 across 3 reads in same session`.

**Step 2 — Implement:** hash of canvas + audio + UA + screen + timezone + font-list. Pure client-side, SubtleCrypto.

**Step 3:** Commit.

## Task 6.2: IndexedDB "your mask" storage

**Step 1 — Test:** `await saveMask(hash); await loadMask() → same hash`.

**Step 2 — Implement** with `idb`.

**Step 3:** Commit.

## Task 6.3: Hero card UI

**Files:** `src/components/ghost-demo/GhostDemo.tsx`, `src/pages/en/index.astro`

**Step 1:** Build card with `IntersectionObserver` triggering hash compute on scroll-into-view. Skeleton state during compute. Reduced-motion → static card with "Compute now" button.

**Step 2:** Returning-visitor logic: compare loaded mask to fresh hash, branch copy.

**Step 3:** Test with `npm run dev`. Commit.

## Task 6.4: "Try to hide" CTA flow

**Step 1:** Three options (Clear site data, Open private window, Switch networks).

**Step 2:** Implement Clear site data via `caches.keys()→delete()`, `indexedDB.databases()→delete()` (preserving our own), localStorage/sessionStorage clear, cookie iteration. Do NOT call `navigator.storage.persist(false)` — it doesn't clear anything.

**Step 3:** Rehash after return. Branch on match vs drift.

**Step 4:** Commit.

## Task 6.5: Per-browser verdict copy for Ghost Demo

**Step 1:** Four templates: vanilla-persistent, Brave-farbled (shifts every session), Tor-bucket-match, private-window-same-canvas.

**Step 2:** Commit.

---

# Phase 7: Content — Wave 1 Structural (Launchable minimums)

Each sub-task is "write one content file to Launchable minimum (~200-400 words)" per the design doc §15.2. One commit per file. Batch PRs are fine (10 files per PR).

## Tasks 7.1.1 – 7.1.22: Vector TL;DRs

For each vector in §5.2:
1. Create `src/content/vectors/<slug>.mdx`.
2. Populate frontmatter (title, description, family, severity, prevalence, last_verified, related — minimum 2).
3. Write TL;DR block + "How it works (plain English)" section (200-300 words combined).
4. `astro check` passes.
5. Commit: `feat(content): <vector> launchable entry`.

## Tasks 7.2.1 – 7.2.22: Category hero blurbs

For each category in §8.2:
1. Create `src/content/categories/<slug>.mdx`.
2. Populate frontmatter + "this just works" pick + 1-sentence blurb per alternative.
3. Commit.

## Tasks 7.3.1 – 7.3.11: Scenario frames

For each scenario in §9.3:
1. Create `src/content/scenarios/<slug>.mdx`.
2. Frontmatter + hero framing + Top 3 (playlist minimum 5 entries with `why`).
3. For `abortion-access-seeker` and `censored-country`: include `jurisdiction_note`.
4. Commit.

---

# Phase 8: Content — Wave 2 Guides (Full v1)

Each guide is a single task: write to full 600-2000 word template (§10 of design doc), verify, commit.

## Tasks 8.1 – 8.25

Guides from §10.2 in order. Each task:
1. Create `src/content/guides/<slug>.mdx`.
2. Populate frontmatter including `time_minutes`, `prerequisites`.
3. Write full template: Hero → What you'll end up with → numbered Steps → Verify (deep-link to `/scan` where relevant) → Common pitfalls → Where to go next.
4. If guide recommends an affiliate tool, affiliate-disclosure note in the TL;DR (not only at the link site).
5. `astro check` passes.
6. Commit.

Ordering prioritizes conversion surface:
- 8.1 Harden Firefox (FPP-first, NOT RFP)
- 8.2 Harden Brave
- 8.5 Migrate from Gmail to Proton (high affiliate value)
- 8.6 Migrate to Bitwarden / Proton Pass
- 8.18 Passkeys primer
- 8.19 YubiKey first-time setup
- 8.20 Tor Browser first-time setup
- 8.21 Mullvad VPN quickstart
- 8.23 Recover from account breach
- … then the rest

---

# Phase 9: Content — Wave 3 Deepening (post-launch)

Executed over the 6 weeks after launch; tracked in `/en/changelog`.

## Task 9.1 – 9.22: Deepen each vector to full 500-1200 words per template
## Task 9.1' – 9.22': Full category comparison matrices
## Task 9.1'' – 9.11'': Full scenario playlists (8-15 items each)

One commit per content file. Expanding-entry banner on the file until it meets Full v1 bar.

---

# Phase 10: Legal + About pages

## Task 10.1: `/en/legal/privacy`

**Files:** `src/pages/en/legal/privacy.astro` + MDX content

**Step 1:** Write honest privacy policy — data controller identity, contact, DSR path ("submit request — expected answer: we have nothing on you"), Cloudflare edge-log disclosure verbatim from their policy, scanner VPS disclosure.

**Step 2:** Commit.

## Task 10.2: `/en/legal/dmca`

**Step 1:** Register DMCA agent ($6/year via a service like Cogent). Include the DMCA notice template + counter-notice template + "we do not silently amend under legal threat" policy.

**Step 2:** Commit.

## Task 10.3: `/en/legal/accessibility`

**Step 1:** WCAG 2.2 AA declared target; contact; known issues list (kept current).

**Step 2:** Commit.

## Task 10.4: `/en/legal/affiliate`

**Step 1:** Long-form disclosure: every partner named; every declined partnership named; "free-first" rule; "we don't rank by commission."

**Step 2:** Commit.

## Task 10.5: `/en/about`

**Step 1:** Founder note under **pseudonym `vulnix0x4`**; required PGP key fingerprint (publish in 3 places: about page, GitHub bio, Matrix account); warrant canary with rotation date.

**Step 2:** `schema.org/Person` JSON-LD uses pseudonym as `name`, omits `givenName`/`familyName`.

**Step 3:** Commit.

## Task 10.6: `/en/about/scanner-privacy`

**Step 1:** Long-form infrastructure transparency: endpoints list, data flow, lifetime, Cloudflare KV "≤2 min" honest claim, link to `privacy-hub-scanner` GitHub repo with specific file-permalinks for Caddyfile, NSD conf, systemd units. Embedded asciinema recording from Task 3.9. 6-month audit + 24-month deep audit commitment.

**Step 2:** Commit.

---

# Phase 11: SEO primitives

## Task 11.1: sitemap.xml

Already wired via `@astrojs/sitemap` in Task 1.2. Verify `dist/sitemap-*.xml` includes every content route.

## Task 11.2: robots.ts

**Files:** `src/pages/robots.txt.ts`

**Step 1:** Dynamic route returning `User-agent: *\nAllow: /\nSitemap: https://privacy.whattheflip.lol/sitemap-index.xml\n`. Explicit allow for GPTBot, ClaudeBot, CCBot, Google-Extended, Bytespider, PerplexityBot.

**Step 2:** Commit.

## Task 11.3: OG image generator

**Files:** `src/pages/og/[...slug].png.ts`

**Step 1:** Use `satori` + `satori-html` to render 1200×628 card with title, category, `last_verified`, at build time.

**Step 2:** Hook into Layout.astro's `<meta property="og:image">`.

**Step 3:** Spot-check 5 pages; verify each has a unique OG image.

**Step 4:** Commit.

## Task 11.4: JSON-LD per page type

**Files:** `src/components/seo/JsonLd.astro` (generic)

**Step 1:** Emit `Article` on encyclopedia/guide/basics, `HowTo` on guides, `BreadcrumbList` on all content, `WebSite` + `SearchAction` on root, `Organization` on `/about`.

**Step 2:** Validate with Google Rich Results Test (manual, spot-check 3 pages).

**Step 3:** Commit.

## Task 11.5: IndexNow submission on deploy

**Files:** `.github/workflows/deploy.yml`, `public/<indexnow-key>.txt`

**Step 1:** Generate key, write to repo and `public/` per IndexNow spec.

**Step 2:** Add CI step that POSTs changed URLs to `https://api.indexnow.org/indexnow` after deploy.

**Step 3:** Commit.

---

# Phase 12: Launch verification

## Task 12.1: Lighthouse gates

**Step 1:** Run Lighthouse on landing, `/en/scan`, a sample vector page, a sample guide. All four routes: Performance ≥ 95, Accessibility = 100, Best Practices = 100, SEO = 100. Non-landing pages can be 100 across all.

**Step 2:** If any fail, fix and re-run. Commit fixes.

## Task 12.2: Accessibility audit

**Step 1:** Run `pa11y-ci` across all routes in CI. Zero WCAG 2.2 AA violations.

**Step 2:** Manual test with NVDA+Firefox and VoiceOver+Safari on the scanner page specifically (focus order, live-region announcements, skip link).

**Step 3:** Commit fixes.

## Task 12.3: No-third-party gate passes on all routes

Already enforced by Task 4.3 CI. Confirm green on `main` at this milestone.

## Task 12.4: Workers observability confirmed disabled

**Step 1:** `wrangler deployments list` and inspect the worker's observability state.

**Step 2:** If enabled, fix wrangler.jsonc, re-deploy, re-verify.

## Task 12.5: Scanner VPS attestation walkthrough

**Step 1:** Record a fresh asciinema of the prod box post-launch-prep: `ls /var/log` empty, `journalctl | wc -l` minimal, `systemctl status` all green, binary hashes match committed SHA-256.

**Step 2:** Commit the .cast to `privacy-hub-scanner/attestations/`.

## Task 12.6: Manual smspool affiliate URL test

**Step 1:** In a real browser, open `https://smspool.net/?r=DaC6ZFhJJL`. Verify the referral applies (account-creation flow shows referrer, or equivalent signal). Owner reported this works in the design-doc owner pass — re-verify once more in prod-like conditions.

**Step 2:** If it fails, escalate before launch; pause smspool inclusion in `/en/categories/sms-verification` until resolved.

## Task 12.7: Content coverage gate

**Step 1:** Every route listed in §15.3 of design doc must be reachable and meet Launchable minimum.

**Step 2:** Every MDX file has `last_verified` set (CI enforces; re-confirm).

## Task 12.8: Cross-browser smoke

**Step 1:** Manual test scanner + Ghost Demo on: Chrome (stable), Firefox (stable ETP Standard), Firefox (ETP Strict + Private), Safari 26, Brave (standard), Mullvad Browser, Tor Browser.

**Step 2:** Each browser's verdict copy is correct (not generic). File bugs for any mis-classified browsers and fix before launch.

---

# Phase 13: Ship + post-launch iteration

## Task 13.1: First /changelog entry

**Step 1:** Write `src/content/changelog/launch.mdx`:
> `2026-04-17` · **Launch.** 22 encyclopedia entries, 22 categories, 11 scenarios, 25 guides, live scanner with Defense Mode Profile, Ghost Demo hero. First quarterly re-verification: 2026-07-17.

## Task 13.2: Announce

**Step 1:** Post to the owner's existing social channels — short, on-voice, links the Ghost Demo first (not /scan), not /vectors.

**Step 2:** Submit to HN, Lobsters, r/privacy, r/privacytoolsIO, r/selfhosted — once, each, not spammily.

## Task 13.3: Wave 3 post-launch sprint kickoff

Start `Phase 9` content deepening per the Wave 3 schedule in §15.2 of design doc.

---

# Risk register during implementation

- **Go TLS ClientHello capture on the VPS is the single gnarliest task** (Task 3.4). If it drags, ship with JA4 as "not yet measured" on the scanner card (BLOCKED-blue treatment) and add as post-launch. Do **not** delay launch for this.
- **Content production takes longer than planned.** Counter by strict Launchable minimums on Wave 1 (200-400 words). Deepening post-launch is explicit and in the plan.
- **Affiliate link breakage** (smspool 403). Mitigated by manual verification in Task 12.6.
- **Scanner island bundle-size overrun.** CI gate enforces < 80 KB gzipped. If hit, split probes into dynamic imports.
- **Lighthouse regression** from Motion / OG-image. Budget in Phase 12 for one performance-tuning pass.

---

# Commit discipline

- **One commit per task step.** Even small Commits. Frequent commits > tidy squashed PRs for this project.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `content:`, `infra:`.
- Always push after each task. Preview URLs per PR give fast feedback.

---

**End of plan.**
