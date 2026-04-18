# privacy.whattheflip.lol

Source for an opinionated, information-first privacy hub.

- **Design doc:** [`docs/plans/2026-04-17-privacy-hub-design.md`](docs/plans/2026-04-17-privacy-hub-design.md)
- **Implementation plan:** [`docs/plans/2026-04-17-privacy-hub-implementation.md`](docs/plans/2026-04-17-privacy-hub-implementation.md)

The scanner backend lives in a separate repo (to-be-linked) and runs as a Docker container on self-hosted infrastructure.

## What this is

A privacy hub that teaches what trackers actually do, shows the visitor what their own browser is leaking, and routes them to the tools that fix each leak. Built with Astro 6 on Cloudflare Workers. No cookies, no analytics, no third-party scripts.

## Getting started (for contributors — post-scaffold)

```bash
npm install
npm run dev
```

Full setup in `docs/plans/2026-04-17-privacy-hub-implementation.md` Phase 1.
