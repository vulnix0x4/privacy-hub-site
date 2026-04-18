# syntax=docker/dockerfile:1.7
# scanner-nsd — authoritative DNS for *.scan.privacy.whattheflip.lol.
#
# NSD is chosen over Knot because NSD has no query-log subsystem at all (design
# doc §13.1 non-negotiable #5). We run the stock Alpine package, minimal config,
# zones on a volume shared with scanner-nonce.

FROM alpine:3.20

# NSD provides both nsd and nsd-control. Tini reaps the daemon's children.
RUN apk add --no-cache nsd tini \
 && mkdir -p /etc/nsd/zones /var/run/nsd \
 && chown -R nsd:nsd /etc/nsd/zones /var/run/nsd

COPY nsd.conf /etc/nsd/nsd.conf
COPY zone-template.txt /etc/nsd/zone-template.txt
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 53/udp
EXPOSE 53/tcp

# PID 1 is tini → entrypoint.sh → nsd. Tini handles SIGTERM forwarding cleanly.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
