#!/usr/bin/env bash
# record-attestation.sh — placeholder for the quarterly attestation capture.
#
# Per design doc §11.4 and attestations/README.md, this script will drive
# the asciinema recording once the Phase 3 scanner backend ships. For v1
# it is intentionally NON-EXECUTABLE: the commands below reference a
# production box that doesn't exist yet.
#
# When Phase 3 lands, flip this file to executable and wire the TODO
# entries below to the real Docker services. Until then, running it will
# print the reminder below and exit non-zero.
#
# Run on the prod box, NOT locally. The whole point is proving the
# production posture.
set -euo pipefail

OUT_DIR="${ATTEST_OUT_DIR:-./attestations}"
DATE_TAG="$(date -u +%Y-%m-%d)"
QUARTER="q$(( ($(date -u +%-m) - 1) / 3 + 1 ))"
OUT_BASE="${OUT_DIR}/${DATE_TAG}-${QUARTER}"
CAST_PATH="${OUT_BASE}.cast"
SUMMARY_PATH="${OUT_BASE}.md"

if [ -z "${I_AM_ON_PROD:-}" ]; then
  cat >&2 <<EOF
record-attestation.sh is a PLACEHOLDER for Phase 3.

This script is meant to run on the production scanner host once the
Docker backend from \`docker-compose.yml\` actually ships. It does not
make sense to run it locally — the whole point is to record production
posture (image digest, tmpfs mount, caddy log redaction, open ports).

When Phase 3 lands, set I_AM_ON_PROD=1 in the environment to proceed,
and flip this file executable.

See attestations/README.md for the full checklist of commands that must
appear in the recording, and the post-recording verification flow.
EOF
  exit 2
fi

# ---- Phase 3 TODOs --------------------------------------------------------
# Uncomment and wire these once the backend services are deployed. Capture
# via asciinema so every command + its output is preserved in the .cast.

# asciinema rec "${CAST_PATH}" --title "privacy.whattheflip.lol attestation ${DATE_TAG}" -- bash -c '
#   set -x
#   uname -a
#   uptime
#   docker ps
#   docker inspect scanner-backend | jq ".[0].Image, .[0].Mounts"
#   mount | grep tmpfs
#   journalctl -u scanner-backend --no-pager | wc -l
#   ls -la /var/log/caddy
#   tail -n 10 /var/log/caddy/access.log
#   ss -tnlp
# '

# sha256sum "${CAST_PATH}" > "${SUMMARY_PATH}"
# gpg --armor --detach-sign "${SUMMARY_PATH}"

echo "Phase 3 scanner backend not deployed yet — record-attestation.sh is a placeholder." >&2
exit 2
