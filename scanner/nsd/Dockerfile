# syntax=docker/dockerfile:1.7
# scanner-nsd — authoritative DNS for *.scan.privacy.whattheflip.lol.
#
# NSD is chosen over Knot because NSD has no query-log subsystem at all (design
# doc §13.1 non-negotiable #5). Phase 3.5 adds dnstap — a streaming Frame
# Streams protocol over a Unix socket, consumed in-memory by the sidecar — so
# we can observe the recursive resolver's egress IP for a nonce without
# persisting anything to disk.
#
# Alpine's stock `nsd` package is NOT built with --enable-dnstap, so we compile
# NSD from source here. Build deps: fstrm (Frame Streams), protobuf-c,
# libevent, openssl, libexpat. Compile output is a single static-ish binary
# plus nsd-control / nsd-checkconf under /usr/local/sbin.

FROM alpine:3.20 AS build

# Build toolchain + NSD dependencies, including dnstap's transitive libs.
RUN apk add --no-cache \
    build-base \
    autoconf \
    automake \
    libtool \
    pkgconfig \
    ca-certificates \
    curl \
    openssl-dev \
    libevent-dev \
    expat-dev \
    fstrm-dev \
    protobuf-c-dev \
    protobuf-c-compiler

# Pin the NSD release explicitly. 4.10.3 ships --enable-dnstap wired through
# configure and has the dnstap-log-auth-{query,response}-messages knobs we need.
ARG NSD_VERSION=4.10.3
ARG NSD_SHA256=29cb92d35aa64dc5d9d48c2e3f8f84a51b1c2c6dfeff3b0d9cb04f3c5ff2d9db

WORKDIR /src
RUN curl -fsSL "https://nlnetlabs.nl/downloads/nsd/nsd-${NSD_VERSION}.tar.gz" \
      -o nsd.tar.gz \
 && tar -xzf nsd.tar.gz \
 && cd "nsd-${NSD_VERSION}" \
 && ./configure \
      --prefix=/usr/local \
      --sysconfdir=/etc \
      --localstatedir=/var \
      --with-run-dir=/var/run/nsd \
      --with-pidfile= \
      --with-user=nsd \
      --enable-dnstap \
      --disable-flto \
 && make -j"$(nproc)" \
 && make install

# Runtime image — fresh Alpine, runtime deps only, bring the compiled binaries.
FROM alpine:3.20

# Runtime libs: libevent, openssl, expat, fstrm, protobuf-c. tini reaps zombies.
RUN apk add --no-cache \
    tini \
    libevent \
    openssl \
    expat \
    fstrm \
    protobuf-c \
 && addgroup -S -g 10053 nsd \
 && adduser -S -G nsd -u 10053 -H -s /sbin/nologin nsd \
 && addgroup -S -g 10054 nsd-nonce \
 && addgroup nsd nsd-nonce \
 && mkdir -p /etc/nsd/zones /var/run/nsd /var/db/nsd \
 && chown -R nsd:nsd /etc/nsd/zones /var/run/nsd /var/db/nsd \
 && chmod 0775 /var/run/nsd

COPY --from=build /usr/local/sbin/nsd /usr/local/sbin/nsd
COPY --from=build /usr/local/sbin/nsd-control /usr/local/sbin/nsd-control
COPY --from=build /usr/local/sbin/nsd-control-setup /usr/local/sbin/nsd-control-setup
COPY --from=build /usr/local/sbin/nsd-checkconf /usr/local/sbin/nsd-checkconf
COPY --from=build /usr/local/sbin/nsd-checkzone /usr/local/sbin/nsd-checkzone

COPY nsd.conf /etc/nsd/nsd.conf
COPY zone-template.txt /etc/nsd/zone-template.txt
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 53/udp
EXPOSE 53/tcp

# PID 1 is tini → entrypoint.sh → nsd. Tini handles SIGTERM forwarding cleanly.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
