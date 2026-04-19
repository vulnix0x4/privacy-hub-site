// Command scanner-nonce is a sidecar that keeps NSD's scan.zone in sync with
// the live nonce set AND observes which recursive resolver queried NSD for
// each nonce so the DNS-leak probe can return a real verdict.
//
// Two loops run concurrently:
//
//  1. ZONE LOOP — poll the web container's /api/scan/nonces-active endpoint
//     every 2 seconds, collect the currently-active nonces, and if the set
//     has changed since last poll, rewrite /etc/nsd/zones/scan.zone. The NSD
//     container's own entrypoint watcher detects the mtime change and reloads
//     locally — no cross-container nsd-control is needed.
//
//  2. DNSTAP LOOP — connect to NSD's dnstap Unix socket as a Frame Streams
//     consumer. For each AUTH_QUERY frame, parse the QNAME and the resolver's
//     egress IP (dnstap's `query_address`). If the QNAME's leftmost label
//     matches a currently-active nonce, POST to /api/scan/record-resolver
//     with the nonce + resolverIp so the nonceStore can pin the association
//     (nonces live 60s; so does the association).
//
// The two loops share a tiny atomic "active nonce set" structure, updated by
// the zone loop and read by the dnstap loop. Concurrent reads are lock-free
// via a sync.Map lookup keyed by nonce.
//
// Privacy discipline:
//   - Log nothing. All writers are io.Discard; stderr only on fatal startup.
//   - Bounded memory: the nonce set is at most ~1000 entries (web limits
//     issue-rate; TTL 60s); we allocate once per poll and let GC reclaim.
//   - No disk writes beyond the zone file itself. dnstap is a streaming
//     binary wire protocol over a Unix socket (kernel-memory-backed).
//   - On malformed dnstap frames: skip the frame and continue. On socket
//     disconnect (NSD reload / restart): reconnect with exponential backoff.
package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// Configurable via env; defaults are container-path conventions.
var (
	webURL               = envDefault("WEB_NONCES_URL", "http://web:4321/api/scan/nonces-active")
	webRecordURL         = envDefault("WEB_RECORD_RESOLVER_URL", "http://web:4321/api/scan/record-resolver")
	dnstapSocket         = envDefault("DNSTAP_SOCKET", "/var/run/nsd/dnstap.sock")
	zoneFile             = envDefault("ZONE_FILE", "/etc/nsd/zones/scan.zone")
	templateFile         = envDefault("ZONE_TEMPLATE", "/etc/nsd/zone-template.txt")
	sidecarToken         = os.Getenv("SCAN_SIDECAR_TOKEN")
	scanDNSDomain        = envDefault("SCAN_DNS_DOMAIN", "scan.privacy.whattheflip.lol")
	pollInterval         = envDurationDefault("POLL_INTERVAL", 2*time.Second)
	dnstapReconnectDelay = envDurationDefault("DNSTAP_RECONNECT_DELAY", 2*time.Second)
)

// nonceResponse matches the web container's /api/scan/nonces-active shape.
type nonceResponse struct {
	Nonces []string `json:"nonces"`
}

// activeSet holds the set of currently-known nonces. Updated by the zone
// loop, read by the dnstap loop. Values are bool (presence markers); we
// use sync.Map for lock-free lookups under churn.
type activeSet struct {
	m atomic.Pointer[map[string]struct{}]
}

func newActiveSet() *activeSet {
	a := &activeSet{}
	empty := make(map[string]struct{})
	a.m.Store(&empty)
	return a
}

func (a *activeSet) replace(nonces []string) {
	next := make(map[string]struct{}, len(nonces))
	for _, n := range nonces {
		next[n] = struct{}{}
	}
	a.m.Store(&next)
}

func (a *activeSet) contains(nonce string) bool {
	cur := a.m.Load()
	if cur == nil {
		return false
	}
	_, ok := (*cur)[nonce]
	return ok
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

	active := newActiveSet()

	// Kick off the dnstap consumer in the background. It reconnects forever
	// until ctx is cancelled.
	wg := &sync.WaitGroup{}
	wg.Add(1)
	go func() {
		defer wg.Done()
		runDnstapLoop(ctx, client, active)
	}()

	// Main goroutine runs the zone poll loop.
	runZoneLoop(ctx, client, template, active)

	// Wait for the dnstap loop to exit cleanly.
	wg.Wait()
}

/* ------------------------------------------------------------------ */
/* Zone loop                                                          */
/* ------------------------------------------------------------------ */

func runZoneLoop(
	ctx context.Context,
	client *http.Client,
	template string,
	active *activeSet,
) {
	var lastHash string
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// One early tick so we don't wait `pollInterval` before the first update.
	zoneTick(ctx, client, template, &lastHash, active)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			zoneTick(ctx, client, template, &lastHash, active)
		}
	}
}

// zoneTick fetches the active nonces and, if they've changed since last poll,
// rewrites the zone. All errors are swallowed — the sidecar is best-effort;
// a transient HTTP failure just means we try again next tick. The active set
// is always refreshed even when the zone rewrite is skipped.
func zoneTick(
	ctx context.Context,
	client *http.Client,
	template string,
	lastHash *string,
	active *activeSet,
) {
	nonces, err := fetchNonces(ctx, client, webURL)
	if err != nil {
		// Web container down or slow — leave the zone as-is, try again next tick.
		return
	}
	sort.Strings(nonces) // Sort so `lastHash` is stable under map iteration order.
	// Always refresh the active set so the dnstap loop can classify frames
	// even when the zone hasn't changed (e.g. when nonces are renewed with
	// the same hash due to sort determinism on the empty set).
	active.replace(nonces)

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

/* ------------------------------------------------------------------ */
/* dnstap loop                                                        */
/* ------------------------------------------------------------------ */

// runDnstapLoop connects to NSD's dnstap socket and processes Frame Streams
// frames until ctx is done. On any I/O error (including initial-connect
// failure) it backs off `dnstapReconnectDelay` and retries.
func runDnstapLoop(ctx context.Context, client *http.Client, active *activeSet) {
	for {
		if ctx.Err() != nil {
			return
		}
		conn, err := net.Dial("unix", dnstapSocket)
		if err != nil {
			// Socket not ready yet (NSD still starting up) — back off and retry.
			if sleepOrDone(ctx, dnstapReconnectDelay) {
				return
			}
			continue
		}
		processDnstap(ctx, conn, client, active)
		_ = conn.Close()
		// NSD may have restarted / reloaded — back off briefly so we don't
		// tight-loop on a permanently-broken socket.
		if sleepOrDone(ctx, dnstapReconnectDelay) {
			return
		}
	}
}

// processDnstap performs the Frame Streams bidirectional handshake, then
// reads DATA frames one at a time and dispatches each to handleDnstapFrame.
// On any malformed frame it tries to skip and continue; on fatal I/O errors
// it returns so the outer loop can reconnect.
func processDnstap(
	ctx context.Context,
	conn net.Conn,
	client *http.Client,
	active *activeSet,
) {
	// Apply a reasonable read deadline-less mode — we want to block waiting
	// for frames indefinitely, but we also want to notice context cancel.
	// Use a goroutine to close the conn on ctx.Done(); any blocked Read
	// returns immediately.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-done:
		}
	}()

	// Bidirectional handshake. For a CONSUMER like us, the sequence is:
	//   producer -> READY (content type)
	//   consumer -> ACCEPT (content type)
	//   producer -> START (content type)
	//   ...DATA frames...
	//   producer -> STOP
	//   consumer -> FINISH
	//
	// NSD is the producer. We ACCEPT then wait for START.
	if err := fsHandshakeConsumer(conn); err != nil {
		return
	}

	// Read frames until error / disconnect.
	for {
		if ctx.Err() != nil {
			return
		}
		kind, payload, err := fsReadFrame(conn)
		if err != nil {
			return
		}
		switch kind {
		case frameKindData:
			handleDnstapFrame(ctx, client, active, payload)
		case frameKindControl:
			// Inspect control type; a STOP means we're done with this stream.
			ctl, _ := fsParseControlType(payload)
			if ctl == controlTypeStop {
				// Acknowledge with FINISH so the producer can close cleanly.
				_ = fsWriteControl(conn, controlTypeFinish, nil)
				return
			}
			// Any unexpected control in the middle of a stream: ignore.
		}
	}
}

// handleDnstapFrame parses one Dnstap protobuf payload. On any parse error
// we silently drop the frame — the sidecar's contract is best-effort.
func handleDnstapFrame(
	ctx context.Context,
	client *http.Client,
	active *activeSet,
	payload []byte,
) {
	msgType, queryAddr, dnsMsg, ok := parseDnstapPayload(payload)
	if !ok {
		return
	}
	// We only care about auth-side queries. MessageType=AUTH_QUERY has value 3
	// in the dnstap.proto enum.
	if msgType != dnstapMsgAuthQuery {
		return
	}
	// Extract the QNAME from the DNS wire message. It's the first question in
	// the query section.
	qname, ok := parseDNSFirstQName(dnsMsg)
	if !ok {
		return
	}
	// Strip the scanner suffix to get the leftmost label (= the nonce).
	nonce := extractNonceLabel(qname, scanDNSDomain)
	if nonce == "" {
		return
	}
	// Drop unknown nonces — a stranger resolving the public zone for no
	// reason shouldn't cause POST churn (task B backpressure requirement).
	if !active.contains(nonce) {
		return
	}
	// Format queryAddr as a text IP. dnstap carries it as packed bytes
	// (4 bytes for IPv4, 16 for IPv6).
	resolverIP := formatIPBytes(queryAddr)
	if resolverIP == "" {
		return
	}
	_ = postResolverObservation(ctx, client, nonce, resolverIP)
}

// postResolverObservation sends {nonce, resolverIp} to the web endpoint. The
// shared-secret header authenticates the sidecar to the web container. We
// swallow errors — a transient failure just means the nonce expires without
// a recorded resolverIp, which the probe handles as "pending".
func postResolverObservation(
	ctx context.Context,
	client *http.Client,
	nonce, resolverIP string,
) error {
	body := struct {
		Nonce      string `json:"nonce"`
		ResolverIP string `json:"resolverIp"`
	}{Nonce: nonce, ResolverIP: resolverIP}
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webRecordURL, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sidecar-Token", sidecarToken)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// Drain the body so the keep-alive connection stays healthy; we don't
	// care about the response shape — a 200 or a 4xx, either way we move on.
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<14))
	return nil
}

// extractNonceLabel pulls the leftmost label from `qname` assuming `qname`
// looks like `<label>.<domain>[.]`. Returns "" if the suffix doesn't match.
// Exported via Extract in tests.
func extractNonceLabel(qname, domain string) string {
	q := strings.TrimSuffix(strings.ToLower(qname), ".")
	d := strings.TrimSuffix(strings.ToLower(domain), ".")
	if !strings.HasSuffix(q, "."+d) {
		return ""
	}
	label := q[:len(q)-len(d)-1]
	// Reject nested labels: we only accept a single leftmost label so
	// `x.y.scan...` can never be matched as `x`. The probe only ever fetches
	// `{nonce}.scan.*`, so this is a tight invariant.
	if strings.Contains(label, ".") {
		return ""
	}
	return label
}

// formatIPBytes converts a raw query_address into dotted/colon notation. Returns
// "" for unexpected lengths.
func formatIPBytes(b []byte) string {
	switch len(b) {
	case 4:
		ip := net.IPv4(b[0], b[1], b[2], b[3])
		return ip.String()
	case 16:
		ip := net.IP(b)
		return ip.String()
	default:
		return ""
	}
}

/* ------------------------------------------------------------------ */
/* Frame Streams protocol                                             */
/* ------------------------------------------------------------------ */

// Frame Streams wire:
//   - DATA frame:    [4-byte BE length][payload...]
//   - CONTROL frame: [4-byte 0x00000000][4-byte BE length][4-byte BE type][TLVs...]
//
// Control types (RFC-less but stable, from the `fstrm` reference header):
const (
	controlTypeAccept = uint32(0x01)
	controlTypeStart  = uint32(0x02)
	controlTypeStop   = uint32(0x03)
	controlTypeReady  = uint32(0x04)
	controlTypeFinish = uint32(0x05)

	controlFieldContentType = uint32(0x01)

	dnstapContentType = "protobuf:dnstap.Dnstap"
)

type frameKind int

const (
	frameKindData frameKind = iota
	frameKindControl
)

// fsReadFrame reads the next frame from conn. For DATA frames, returns
// frameKindData + the raw payload. For CONTROL frames, returns frameKindControl
// + the control body (the 4-byte type word + any TLVs).
func fsReadFrame(conn net.Conn) (frameKind, []byte, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(conn, hdr[:]); err != nil {
		return 0, nil, err
	}
	length := binary.BigEndian.Uint32(hdr[:])
	if length == 0 {
		// Control frame: read the actual length word next.
		var ctrlLen [4]byte
		if _, err := io.ReadFull(conn, ctrlLen[:]); err != nil {
			return 0, nil, err
		}
		size := binary.BigEndian.Uint32(ctrlLen[:])
		if size > 1<<20 {
			return 0, nil, errors.New("control frame too large")
		}
		payload := make([]byte, size)
		if size > 0 {
			if _, err := io.ReadFull(conn, payload); err != nil {
				return 0, nil, err
			}
		}
		return frameKindControl, payload, nil
	}
	if length > 1<<20 {
		// Sanity cap: 1 MiB per DATA frame. dnstap payloads are ~100 bytes.
		return 0, nil, errors.New("data frame too large")
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(conn, payload); err != nil {
		return 0, nil, err
	}
	return frameKindData, payload, nil
}

// fsWriteControl sends a CONTROL frame with the given type + optional body.
// body is appended after the 4-byte type word.
func fsWriteControl(conn net.Conn, ctl uint32, body []byte) error {
	// Wire: [4B zero][4B length][4B type][body...]
	buf := make([]byte, 0, 12+len(body))
	buf = append(buf, 0, 0, 0, 0) // escape
	// length = 4 (type) + len(body)
	lenBytes := [4]byte{}
	binary.BigEndian.PutUint32(lenBytes[:], uint32(4+len(body)))
	buf = append(buf, lenBytes[:]...)
	typeBytes := [4]byte{}
	binary.BigEndian.PutUint32(typeBytes[:], ctl)
	buf = append(buf, typeBytes[:]...)
	buf = append(buf, body...)
	_, err := conn.Write(buf)
	return err
}

// fsParseControlType peels the 4-byte type word off the front of a control
// payload and returns it along with the remaining TLV bytes.
func fsParseControlType(payload []byte) (uint32, []byte) {
	if len(payload) < 4 {
		return 0, nil
	}
	return binary.BigEndian.Uint32(payload[:4]), payload[4:]
}

// fsHandshakeConsumer walks the consumer side of the bidirectional Frame
// Streams startup sequence:
//
//	producer -> READY   (consumer reads)
//	consumer -> ACCEPT  (consumer writes)
//	producer -> START   (consumer reads)
//
// Each READY/ACCEPT carries a content-type TLV; we echo the producer's value
// back in ACCEPT so it knows we understand the stream.
func fsHandshakeConsumer(conn net.Conn) error {
	// Read READY.
	kind, payload, err := fsReadFrame(conn)
	if err != nil {
		return err
	}
	if kind != frameKindControl {
		return errors.New("expected control READY, got data")
	}
	ctl, tlvs := fsParseControlType(payload)
	if ctl != controlTypeReady {
		return errors.New("expected READY")
	}
	// Find the content-type TLV in the READY body and echo it back.
	contentType := parseContentTypeTLV(tlvs)
	// ACCEPT with the same content-type.
	acceptBody := encodeContentTypeTLV(contentType)
	if err := fsWriteControl(conn, controlTypeAccept, acceptBody); err != nil {
		return err
	}
	// Read START.
	kind, payload, err = fsReadFrame(conn)
	if err != nil {
		return err
	}
	if kind != frameKindControl {
		return errors.New("expected control START, got data")
	}
	ctl, _ = fsParseControlType(payload)
	if ctl != controlTypeStart {
		return errors.New("expected START")
	}
	return nil
}

// parseContentTypeTLV scans a control body's TLV list and returns the first
// content-type value it finds, or the canonical dnstap content type if none.
func parseContentTypeTLV(tlvs []byte) string {
	for len(tlvs) >= 8 {
		fieldType := binary.BigEndian.Uint32(tlvs[:4])
		fieldLen := binary.BigEndian.Uint32(tlvs[4:8])
		if 8+fieldLen > uint32(len(tlvs)) {
			break
		}
		if fieldType == controlFieldContentType {
			return string(tlvs[8 : 8+fieldLen])
		}
		tlvs = tlvs[8+fieldLen:]
	}
	return dnstapContentType
}

// encodeContentTypeTLV builds one content-type TLV.
func encodeContentTypeTLV(ct string) []byte {
	buf := make([]byte, 8+len(ct))
	binary.BigEndian.PutUint32(buf[:4], controlFieldContentType)
	binary.BigEndian.PutUint32(buf[4:8], uint32(len(ct)))
	copy(buf[8:], ct)
	return buf
}

/* ------------------------------------------------------------------ */
/* Dnstap protobuf (tiny reader)                                      */
/* ------------------------------------------------------------------ */

// Dnstap protobuf schema (dnstap.proto, relevant subset):
//
//	message Dnstap {
//	  required bytes identity = 1;
//	  required bytes version = 2;
//	  optional bytes extra = 3;
//	  required Message message = 14;
//	  required Type type = 15;   // enum: MESSAGE=1
//	}
//	message Message {
//	  required Type type = 1;     // enum MessageType: AUTH_QUERY=3, AUTH_RESPONSE=4, ...
//	  optional SocketFamily socket_family = 2;
//	  optional SocketProtocol socket_protocol = 3;
//	  optional bytes query_address = 4;
//	  optional bytes response_address = 5;
//	  optional uint32 query_port = 6;
//	  optional uint32 response_port = 7;
//	  optional uint64 query_time_sec = 8;
//	  optional fixed32 query_time_nsec = 9;
//	  optional bytes query_message = 10;
//	  optional uint64 query_zone = 11;
//	  ...
//	}
//
// We extract only the three fields we need: message.type (1), message.query_address (4),
// and message.query_message (10). Everything else is skipped by wire-type.

// dnstap message type enum values (MessageType in dnstap.proto).
const (
	dnstapMsgAuthQuery = 3 // AUTH_QUERY
)

// Protobuf wire types.
const (
	wireVarint  = 0
	wireFixed64 = 1
	wireLenDel  = 2
	wireFixed32 = 5
)

// parseDnstapPayload walks the protobuf and returns (message.type,
// message.query_address, message.query_message, ok). "ok" is true if the
// payload is well-formed and has both a type and a query_message.
func parseDnstapPayload(buf []byte) (int, []byte, []byte, bool) {
	// Find the `message` sub-message (field 14, wire-type LEN-DELIM).
	var msgBuf []byte
	for len(buf) > 0 {
		key, v, rest, ok := pbReadField(buf)
		if !ok {
			return 0, nil, nil, false
		}
		buf = rest
		field := key >> 3
		wire := key & 7
		if field == 14 && wire == wireLenDel {
			msgBuf = v.bytes
		}
	}
	if msgBuf == nil {
		return 0, nil, nil, false
	}
	msgType := -1
	var queryAddr, queryMsg []byte
	for len(msgBuf) > 0 {
		key, v, rest, ok := pbReadField(msgBuf)
		if !ok {
			return 0, nil, nil, false
		}
		msgBuf = rest
		field := key >> 3
		wire := key & 7
		switch {
		case field == 1 && wire == wireVarint:
			msgType = int(v.varint)
		case field == 4 && wire == wireLenDel:
			queryAddr = v.bytes
		case field == 10 && wire == wireLenDel:
			queryMsg = v.bytes
		}
	}
	if msgType == -1 || queryMsg == nil {
		return 0, nil, nil, false
	}
	return msgType, queryAddr, queryMsg, true
}

// pbValue is a union of the possible protobuf-decoded value shapes. Only
// one of `varint` / `bytes` is set per field; callers know which by wire type.
type pbValue struct {
	varint uint64
	bytes  []byte
}

// pbReadField decodes one protobuf field from buf and returns (key, value,
// rest, ok). key encodes field number + wire type. On malformed input, returns
// ok=false.
func pbReadField(buf []byte) (uint64, pbValue, []byte, bool) {
	key, rest, ok := pbReadVarint(buf)
	if !ok {
		return 0, pbValue{}, nil, false
	}
	wire := key & 7
	switch wire {
	case wireVarint:
		v, rest2, ok := pbReadVarint(rest)
		if !ok {
			return 0, pbValue{}, nil, false
		}
		return key, pbValue{varint: v}, rest2, true
	case wireLenDel:
		length, rest2, ok := pbReadVarint(rest)
		if !ok || uint64(len(rest2)) < length {
			return 0, pbValue{}, nil, false
		}
		return key, pbValue{bytes: rest2[:length]}, rest2[length:], true
	case wireFixed64:
		if len(rest) < 8 {
			return 0, pbValue{}, nil, false
		}
		return key, pbValue{}, rest[8:], true
	case wireFixed32:
		if len(rest) < 4 {
			return 0, pbValue{}, nil, false
		}
		return key, pbValue{}, rest[4:], true
	default:
		return 0, pbValue{}, nil, false
	}
}

// pbReadVarint decodes one protobuf varint from the head of buf.
func pbReadVarint(buf []byte) (uint64, []byte, bool) {
	var v uint64
	var shift uint
	for i := 0; i < len(buf); i++ {
		b := buf[i]
		if i >= 10 {
			return 0, nil, false
		}
		v |= uint64(b&0x7f) << shift
		if b&0x80 == 0 {
			return v, buf[i+1:], true
		}
		shift += 7
	}
	return 0, nil, false
}

/* ------------------------------------------------------------------ */
/* DNS wire message (QNAME extraction only)                           */
/* ------------------------------------------------------------------ */

// parseDNSFirstQName extracts the first QNAME from a raw DNS message. The
// message layout is: 12-byte header, then QDCOUNT question records, each
// consisting of a length-prefixed label sequence, ending in a zero byte,
// followed by 2-byte QTYPE + 2-byte QCLASS.
//
// We don't need to handle label compression — compression pointers are only
// valid in RR data, not in the question section. Even if a faulty resolver
// sent one, we'd just bail out; missing the nonce observation isn't fatal.
func parseDNSFirstQName(msg []byte) (string, bool) {
	if len(msg) < 12 {
		return "", false
	}
	qdcount := binary.BigEndian.Uint16(msg[4:6])
	if qdcount == 0 {
		return "", false
	}
	pos := 12
	var labels []string
	for {
		if pos >= len(msg) {
			return "", false
		}
		l := int(msg[pos])
		pos++
		if l == 0 {
			break
		}
		if l > 63 { // compressed pointer or invalid length
			return "", false
		}
		if pos+l > len(msg) {
			return "", false
		}
		labels = append(labels, string(msg[pos:pos+l]))
		pos += l
	}
	return strings.Join(labels, "."), true
}

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

// sleepOrDone sleeps for `d` OR returns true immediately if ctx is cancelled.
func sleepOrDone(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return true
	case <-t.C:
		return false
	}
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
