#!/bin/sh
# scanner-nsd entrypoint.
#
# 1. Ensure a bootstrap zone file exists (the sidecar rewrites it once ready;
#    NSD refuses to start with a missing zone).
# 2. Run nsd-checkconf to fail loud on config errors.
# 3. Generate an nsd-control keypair (in-memory via tmpfs) so nsd-control
#    locally can call reload.
# 4. Launch NSD in foreground + a zone-file watcher that calls
#    `nsd-control reload` when scan.zone's mtime changes.
#
# Cross-container control (sidecar → nsd) is deliberately avoided: the
# sidecar only writes the zone file, and THIS container detects the change
# and reloads. Keeps UNIX socket permissions inside the nsd container,
# which is the only thing that can read/write its own socket.
#
# No logging beyond startup/fatal stderr lines. Per design §13.1, NSD's
# verbosity: 0 + no logfile directive keeps query traffic off disk.
set -eu

ZONES_DIR="/etc/nsd/zones"
ZONE_FILE="${ZONES_DIR}/scan.zone"
TEMPLATE="/etc/nsd/zone-template.txt"
NSD_RUN_DIR="/var/run/nsd"

mkdir -p "${ZONES_DIR}" "${NSD_RUN_DIR}"
chown nsd:nsd "${ZONES_DIR}" "${NSD_RUN_DIR}" 2>/dev/null || true

# Bootstrap zone if the sidecar hasn't written one yet. Idempotent — the
# sidecar's next rewrite will overwrite with the live serial.
if [ ! -s "${ZONE_FILE}" ]; then
    SERIAL="$(date +%s)"
    sed \
        -e "s|{{SERIAL}}|${SERIAL}|g" \
        -e "s|{{NONCE_RECORDS}}||g" \
        "${TEMPLATE}" > "${ZONE_FILE}"
    chown nsd:nsd "${ZONE_FILE}" 2>/dev/null || true
fi

# Generate nsd-control keypair into tmpfs-backed /var/db/nsd. Idempotent;
# nsd-control-setup refuses to overwrite existing keys. Errors are ignored
# so re-runs (restart loops) don't fail.
nsd-control-setup >/dev/null 2>&1 || true

# Sanity-check config before starting the daemon.
nsd-checkconf /etc/nsd/nsd.conf

# Launch the zone watcher in the background. It polls mtime every 2s and
# calls `nsd-control reload` on change. Silence all output.
(
    last=""
    while true; do
        # stat -c on busybox returns "%Y" as mtime; if file missing, -c prints "".
        cur="$(stat -c %Y "${ZONE_FILE}" 2>/dev/null || echo "")"
        if [ -n "${cur}" ] && [ "${cur}" != "${last}" ]; then
            if [ -n "${last}" ]; then
                nsd-control reload >/dev/null 2>&1 || true
            fi
            last="${cur}"
        fi
        sleep 2
    done
) &
WATCHER_PID=$!

# Forward SIGTERM to children on shutdown.
trap 'kill -TERM "${WATCHER_PID}" 2>/dev/null; kill -TERM $! 2>/dev/null; wait' TERM INT

# Foreground NSD. Must be exec-less so we can keep the shell trap alive
# and continue reaping the watcher.
nsd -d -c /etc/nsd/nsd.conf &
NSD_PID=$!
wait "${NSD_PID}"
