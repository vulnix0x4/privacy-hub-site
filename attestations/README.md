# Attestations

Per design doc §11.4, privacy.whattheflip.lol commits to **quarterly
asciinema attestation** of the production scanner backend. This folder
holds those recordings.

## Format

- One asciinema `.cast` file per recording, named by ISO date:
  - `2026-07-18-q3.cast`
  - `2026-10-18-q4.cast`
  - `2027-01-18-q1.cast`
- A matching `YYYY-MM-DD-qN.md` alongside each cast, containing:
  - The SHA-256 of the `.cast` file.
  - The host identity (Caddy's observed fingerprint + `uname -a` excerpt).
  - The scanner backend image digest (`docker inspect`).
  - A one-paragraph human summary of what the session demonstrated.
  - The PGP-signed (detached) checksum of the `.cast`.
- Index: append an entry to `src/content/changelog.mdx` under the
  "Attestations" heading pointing at the published `.cast`.

## What each recording should show

From `docs/plans/2026-04-17-privacy-hub-design.md` §11.4:

1. `uname -a`, `uptime`, kernel flags — prove the host identity.
2. `docker ps` + `docker inspect` on the scanner backend — prove the image
   digest matches what was last published to GHCR.
3. `mount | grep tmpfs` — prove the scanner's data volume is a tmpfs
   (design doc §8 promise: "no persistent storage").
4. `journalctl --no-pager | wc -l` on the scanner unit — prove the log ring
   is bounded and has not been abused for surveillance.
5. `ls -la /var/log/caddy` + tail of the last 10 lines — prove request
   logs are redacted (no IP, no path beyond locale + route).
6. `ss -tnlp` — prove only the documented ports are open.

## First attestation gate

**The first asciinema drop lands with the scanner-backend Docker services
shipping in Phase 3.** Until Phase 3 ships, this folder contains only
`README.md`, `.gitkeep`, and the placeholder `record-attestation.sh` in
`scripts/`.

Do NOT fabricate an attestation. The design-doc promise is about a live
production system; recording one before Phase 3 would be a lie.

## Verifying an attestation

1. Clone the cast file: `curl -O https://privacy.whattheflip.lol/attestations/<file>.cast`.
2. `asciinema play <file>.cast` (or upload to asciinema.org for a shareable URL).
3. Verify checksum: `sha256sum -c <file>.md` against the `.cast`.
4. Verify PGP signature of the checksum against the key published on
   `/en/about/`.

Any mismatch is a breach signal. Report via the contact path on the
about page.
