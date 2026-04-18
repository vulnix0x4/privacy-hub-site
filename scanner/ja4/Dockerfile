# syntax=docker/dockerfile:1.7
# scanner-ja4 — Go TLS handler that terminates TLS itself and computes the
# JA4 fingerprint for the observed ClientHello.
#
# Build stage: Alpine Go, static binary.
# Run stage:   scratch + CA certs (we never call out, but scratch is the
#              minimal attack surface).

FROM golang:1.23-alpine AS build
WORKDIR /src
# Copy module files first so Go can cache the (empty) dep graph between builds.
COPY go.mod ./
# No go.sum because we have zero external deps — vendored stdlib only.
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/scanner-ja4 .

FROM scratch
# Non-root UID/GID; scratch has no passwd so we use a numeric id.
USER 10001:10001
COPY --from=build /out/scanner-ja4 /scanner-ja4
EXPOSE 8443
ENTRYPOINT ["/scanner-ja4"]
