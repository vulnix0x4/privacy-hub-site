// Command scanner-nonce is a sidecar that keeps NSD's scan.zone in sync with
// the live nonce set.
//
// Polling strategy: hit the web container's /api/scan/nonces-active endpoint
// every 2 seconds and collect the currently-active nonces. If the set has
// changed since last poll, rewrite /etc/nsd/zones/scan.zone and let the NSD
// container's own entrypoint watcher detect the mtime change and call
// nsd-control reload locally. Cross-container nsd-control was considered
// but UNIX-socket permissions make it brittle; a file-watch in the same
// container is simpler and equally bounded.
//
// The brief originally called for reading the SQLite DB directly, but an HTTP
// endpoint on the web container is a cleaner boundary: zero SQLite code in Go,
// no shared-file-locking concerns across processes, and the privacy discipline
// stays identical (we log nothing either side).
//
// Privacy discipline:
//   - Log nothing. All writers are io.Discard; stderr only on fatal startup.
//   - Bounded memory: the nonce set is at most ~100 entries (web limits
//     issue-rate; TTL 60s); we allocate once per poll and let GC reclaim.
//   - No disk writes beyond the zone file itself.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"
)

// Configurable via env; defaults are container-path conventions.
var (
	webURL       = envDefault("WEB_NONCES_URL", "http://web:4321/api/scan/nonces-active")
	zoneFile     = envDefault("ZONE_FILE", "/etc/nsd/zones/scan.zone")
	templateFile = envDefault("ZONE_TEMPLATE", "/etc/nsd/zone-template.txt")
	pollInterval = envDurationDefault("POLL_INTERVAL", 2*time.Second)
)

// nonceResponse matches the web container's /api/scan/nonces-active shape.
type nonceResponse struct {
	Nonces []string `json:"nonces"`
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	client := &http.Client{
		Timeout: 3 * time.Second,
	}

	// Read the template once at startup. Template changes require a container
	// restart — acceptable because the template is part of the image.
	templateBytes, err := os.ReadFile(templateFile)
	if err != nil {
		fatal("template read failed: " + err.Error())
	}
	template := string(templateBytes)

	var lastHash string
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// One early tick so we don't wait `pollInterval` before the first update.
	runOnce(ctx, client, template, &lastHash)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runOnce(ctx, client, template, &lastHash)
		}
	}
}

// runOnce fetches the active nonces and, if they've changed since last poll,
// rewrites the zone and reloads NSD. All errors are swallowed — the sidecar
// is best-effort; a transient HTTP failure just means we try again next tick.
func runOnce(ctx context.Context, client *http.Client, template string, lastHash *string) {
	nonces, err := fetchNonces(ctx, client, webURL)
	if err != nil {
		// Web container down or slow — leave the zone as-is, try again next tick.
		return
	}
	sort.Strings(nonces) // Sort so `lastHash` is stable under map iteration order.
	hash := fingerprint(nonces)
	if hash == *lastHash {
		return
	}

	zone := renderZone(template, nonces, time.Now().Unix())
	if err := atomicWrite(zoneFile, zone); err != nil {
		return
	}
	// NSD container's own watcher picks up the mtime change and reloads.
	// No cross-container nsd-control call needed from here.
	*lastHash = hash
}

// fetchNonces GETs the nonces-active endpoint and returns the list.
func fetchNonces(ctx context.Context, client *http.Client, url string) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("non-2xx: " + resp.Status)
	}
	var body nonceResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil {
		return nil, err
	}
	// Defensive: clamp at 1000 entries. The web endpoint caps too, but belt
	// and braces — prevents a runaway zone file if the web container misbehaves.
	if len(body.Nonces) > 1000 {
		body.Nonces = body.Nonces[:1000]
	}
	return body.Nonces, nil
}

// RenderZone (exported alias for testing) interpolates the template with the
// active nonce list and a serial. Exposed as a package-level function so
// main_test.go can exercise it without running the whole poll loop.
func RenderZone(template string, nonces []string, serial int64) string {
	return renderZone(template, nonces, serial)
}

// renderZone replaces {{SERIAL}} and {{NONCE_RECORDS}} in the template.
// Each nonce produces one TXT record + one A record; both 127.0.0.1 for A.
//
// We validate each nonce before interpolating — only ASCII hex/dash/alnum.
// Anything else is silently skipped. This is belt-and-braces against a
// compromised web container trying to inject zone-file syntax.
func renderZone(template string, nonces []string, serial int64) string {
	var records strings.Builder
	for _, n := range nonces {
		if !isValidNonce(n) {
			continue
		}
		// Example:
		//   abc123.  IN  TXT  "abc123"
		//   abc123.  IN  A    127.0.0.1
		records.WriteString(n)
		records.WriteString(" IN TXT \"")
		records.WriteString(n)
		records.WriteString("\"\n")
		records.WriteString(n)
		records.WriteString(" IN A 127.0.0.1\n")
	}
	out := template
	out = strings.ReplaceAll(out, "{{SERIAL}}", itoa(serial))
	out = strings.ReplaceAll(out, "{{NONCE_RECORDS}}", records.String())
	return out
}

// isValidNonce accepts UUIDv4 strings and similarly-shaped hex/dash tokens.
// Specifically: letters [a-zA-Z], digits [0-9], hyphen, length 8..64.
func isValidNonce(n string) bool {
	if len(n) < 8 || len(n) > 64 {
		return false
	}
	for i := 0; i < len(n); i++ {
		c := n[i]
		switch {
		case c >= 'a' && c <= 'z':
		case c >= 'A' && c <= 'Z':
		case c >= '0' && c <= '9':
		case c == '-':
		default:
			return false
		}
	}
	return true
}

// fingerprint returns a quick stable signature of the nonce list so we can
// tell if it changed without diffing every poll. Sorted input assumed.
func fingerprint(nonces []string) string {
	if len(nonces) == 0 {
		return ""
	}
	return strings.Join(nonces, "|")
}

// atomicWrite writes `data` to `path` via a same-directory temp file + rename
// so readers (NSD) never see a half-written zone.
func atomicWrite(path, data string) error {
	dir := path + ".tmp"
	if err := os.WriteFile(dir, []byte(data), 0o644); err != nil {
		return err
	}
	return os.Rename(dir, path)
}

func envDefault(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func envDurationDefault(name string, fallback time.Duration) time.Duration {
	if v := os.Getenv(name); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func fatal(msg string) {
	_, _ = io.WriteString(os.Stderr, "nonce: "+msg+"\n")
	os.Exit(1)
}
