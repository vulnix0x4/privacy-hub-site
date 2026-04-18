# syntax=docker/dockerfile:1.7
# scanner-nonce — sidecar that polls the web container for active nonces
# and rewrites NSD's scan.zone on change, then calls `nsd-control reload`.
#
# Two-stage: Go static build, then a minimal Alpine runtime with nsd-utils
# (for nsd-control). We can't use scratch here because nsd-control is
# invoked via exec.

FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/scanner-nonce .

FROM alpine:3.20
RUN apk add --no-cache nsd tini \
 && addgroup -S nonce -g 10002 \
 && adduser -S nonce -G nonce -u 10002 -h /home/nonce
# nsd-control needs to read its socket; socket lives in a volume shared
# with scanner-nsd. We don't chown here — the volume mount at runtime
# will surface the nsd-owned socket, and we grant via supplementary
# group in compose (or unix socket 0o666 in nsd.conf, TBD).
COPY --from=build /out/scanner-nonce /usr/local/bin/scanner-nonce
USER 10002:10002
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/scanner-nonce"]
