# syntax=docker/dockerfile:1.7
# scanner-nonce — sidecar that polls the web container for active nonces
# and rewrites NSD's scan.zone on change.
#
# The NSD container's own entrypoint watches scan.zone's mtime and calls
# nsd-control reload locally when it changes, so this sidecar doesn't need
# nsd-control or cross-container socket access. Result: a scratch runtime
# with just the Go static binary.

FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/scanner-nonce .

FROM scratch
USER 10002:10002
COPY --from=build /out/scanner-nonce /scanner-nonce
ENTRYPOINT ["/scanner-nonce"]
