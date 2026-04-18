#!/bin/sh
# scanner-nsd entrypoint.
#
# 1. Ensure a bootstrap zone file exists (the sidecar rewrites it once ready;
#    NSD refuses to start with a missing zone).
# 2. Run nsd-checkconf to fail loud on config errors.
# 3. Exec nsd in the foreground.
#
# No logging beyond startup/fatal stderr lines. Per design §13.1, NSD's
# verbosity: 0 + no logfile directive keeps query traffic off disk.
set -eu

ZONES_DIR="/etc/nsd/zones"
ZONE_FILE="${ZONES_DIR}/scan.zone"
TEMPLATE="/etc/nsd/zone-template.txt"

mkdir -p "${ZONES_DIR}"
mkdir -p /var/run/nsd
chown nsd:nsd "${ZONES_DIR}" /var/run/nsd

# Bootstrap zone if the sidecar hasn't written one yet. Idempotent — the
# sidecar's next rewrite will overwrite with the live serial.
if [ ! -s "${ZONE_FILE}" ]; then
    SERIAL="$(date +%s)"
    # Portable sed: use `|` as delimiter to avoid escaping slashes.
    sed \
        -e "s|{{SERIAL}}|${SERIAL}|g" \
        -e "s|{{NONCE_RECORDS}}||g" \
        "${TEMPLATE}" > "${ZONE_FILE}"
fi

# Sanity-check the config before starting the daemon — catches typos that
# would otherwise manifest as silent restart loops under Docker.
nsd-checkconf /etc/nsd/nsd.conf

# Foreground mode (-d) keeps PID 1 inside the container as NSD itself.
exec nsd -d -c /etc/nsd/nsd.conf
