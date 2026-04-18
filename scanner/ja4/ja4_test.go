package ja4

import (
	"crypto/tls"
	"regexp"
	"strings"
	"testing"
)

// ja4Shape matches `tXXyZZNNaa_hhhhhhhhhhhh_hhhhhhhhhhhh` where X/Y are the
// version digits, Z is `d` or `i`, NN are 2-digit counts, aa is the ALPN token,
// and the tail hashes are exactly 12 lowercase hex chars.
var ja4Shape = regexp.MustCompile(`^[tq][0-9s][0-9s][di][0-9]{2}[0-9]{2}[0-9a-zA-Z]{2}_[0-9a-f]{12}_[0-9a-f]{12}$`)

func TestCompute_MinimalHello_ShapeIsValid(t *testing.T) {
	h := Hello{
		CipherSuites:      []uint16{0x1301},
		Extensions:        []uint16{0x002b},
		SupportedVersions: []uint16{tls.VersionTLS13},
		SNIPresent:        false,
		ALPNProtocols:     nil,
		Protocol:          "t",
	}
	r := Compute(h)
	if !ja4Shape.MatchString(r.JA4) {
		t.Fatalf("JA4 shape invalid: %q", r.JA4)
	}
	// Minimal hello has no SNI → `i` in position 4.
	if r.JA4[3] != 'i' {
		t.Fatalf("expected SNI flag `i` for no-SNI hello; got %c (%q)", r.JA4[3], r.JA4)
	}
	// No ALPN → ALPN token is "00".
	if !strings.HasPrefix(r.JA4, "t13i") {
		t.Fatalf("expected prefix t13i... for TLS1.3 no-SNI; got %q", r.JA4)
	}
}

func TestCompute_ChromeLikeHello_WithSNI_SetsDFlag(t *testing.T) {
	// A synthetic Chrome-ish hello: TLS 1.3, SNI present, h2 ALPN, a
	// handful of ciphers and extensions.
	h := Hello{
		CipherSuites: []uint16{
			0x1301, 0x1302, 0x1303, // TLS 1.3 cipher suites
			0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8,
			0xc013, 0xc014, 0x009c, 0x009d, 0x002f, 0x0035,
		},
		Extensions: []uint16{
			0x0000, // SNI
			0x0017, // extended_master_secret
			0xff01, // renegotiation_info
			0x000a, // supported_groups
			0x000b, // ec_point_formats
			0x0023, // session_ticket
			0x0010, // ALPN
			0x0005, // status_request
			0x000d, // signature_algorithms
			0x0012, // signed_certificate_timestamp
			0x0033, // key_share
			0x002d, // psk_key_exchange_modes
			0x002b, // supported_versions
			0x001b, // compress_certificate
			0x0015, // padding
			0xfe0d, // encrypted_client_hello
		},
		SupportedVersions:   []uint16{tls.VersionTLS13, tls.VersionTLS12},
		SignatureAlgorithms: []uint16{0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601},
		SNIPresent:          true,
		ALPNProtocols:       []string{"h2", "http/1.1"},
		Protocol:            "t",
	}
	r := Compute(h)
	if !ja4Shape.MatchString(r.JA4) {
		t.Fatalf("JA4 shape invalid: %q", r.JA4)
	}
	if r.JA4[3] != 'd' {
		t.Fatalf("expected SNI flag `d` for hello with SNI; got %c (%q)", r.JA4[3], r.JA4)
	}
	// ALPN token should be "h2" (first+last char of "h2" = 'h','2').
	if !strings.HasPrefix(r.JA4, "t13d") {
		t.Fatalf("expected prefix t13d...; got %q", r.JA4)
	}
	// Expect 15 ciphers, 16 extensions, ALPN h2 → the prefix part looks like t13d1516h2.
	wantPrefix := "t13d1516h2"
	if !strings.HasPrefix(r.JA4, wantPrefix+"_") {
		t.Fatalf("expected prefix %q_...; got %q", wantPrefix, r.JA4)
	}
}

func TestCompute_ChromeLikeHello_WithoutSNI_SetsIFlag(t *testing.T) {
	// Same hello as above but SNIPresent=false. The `i` flag flips, and the
	// extension count stays the same (SNI is still in the Extensions list per
	// the hello bytes — SNIPresent is a separate signal driving the prefix).
	h := Hello{
		CipherSuites:      []uint16{0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f},
		Extensions:        []uint16{0x002b, 0x000d, 0x000a, 0x0033},
		SupportedVersions: []uint16{tls.VersionTLS13},
		SNIPresent:        false,
		ALPNProtocols:     []string{"h2"},
		Protocol:          "t",
	}
	r := Compute(h)
	if r.JA4[3] != 'i' {
		t.Fatalf("expected SNI flag `i` when SNIPresent=false; got %c (%q)", r.JA4[3], r.JA4)
	}
}

func TestCompute_GREASE_FilteredFromCipherAndExtensionLists(t *testing.T) {
	// Craft an input with both GREASE values (0x?a?a where nibbles match) and
	// real values. Assert the counts and hashes reflect the filtered lists.
	withGREASE := Hello{
		CipherSuites:      []uint16{0x0a0a, 0x1301, 0x2a2a, 0x1302}, // 2 GREASE + 2 real
		Extensions:        []uint16{0x1a1a, 0x002b, 0xeaea, 0x000d}, // 2 GREASE + 2 real
		SupportedVersions: []uint16{tls.VersionTLS13},
		SNIPresent:        false,
		ALPNProtocols:     nil,
		Protocol:          "t",
	}
	withoutGREASE := Hello{
		CipherSuites:      []uint16{0x1301, 0x1302},
		Extensions:        []uint16{0x002b, 0x000d},
		SupportedVersions: []uint16{tls.VersionTLS13},
		SNIPresent:        false,
		ALPNProtocols:     nil,
		Protocol:          "t",
	}
	r1 := Compute(withGREASE)
	r2 := Compute(withoutGREASE)
	// JA4 strings MUST be identical — GREASE is filtered before counting and
	// before hashing.
	if r1.JA4 != r2.JA4 {
		t.Fatalf("GREASE filter leaked into JA4 output:\n with    = %q\n without = %q", r1.JA4, r2.JA4)
	}
	if !strings.HasPrefix(r1.JA4, "t13i0202") {
		t.Fatalf("expected cipher count 02 and ext count 02 after GREASE filter; got %q", r1.JA4)
	}
}

func TestCompute_ExtensionSort_IsStable(t *testing.T) {
	// Two Hello inputs that differ only in extension order must produce the
	// same JA4 (extensions are sorted before hashing).
	a := Hello{
		CipherSuites:      []uint16{0x1301},
		Extensions:        []uint16{0x002b, 0x000d, 0x0033, 0x000a},
		SupportedVersions: []uint16{tls.VersionTLS13},
		Protocol:          "t",
	}
	b := Hello{
		CipherSuites:      []uint16{0x1301},
		Extensions:        []uint16{0x0033, 0x000a, 0x002b, 0x000d},
		SupportedVersions: []uint16{tls.VersionTLS13},
		Protocol:          "t",
	}
	ra := Compute(a)
	rb := Compute(b)
	if ra.JA4 != rb.JA4 {
		t.Fatalf("extension sort not stable: %q vs %q", ra.JA4, rb.JA4)
	}
}

func TestCompute_ALPN_h2_ProducesH2Token(t *testing.T) {
	h := Hello{
		CipherSuites:      []uint16{0x1301},
		Extensions:        []uint16{0x0010}, // ALPN ext
		SupportedVersions: []uint16{tls.VersionTLS13},
		ALPNProtocols:     []string{"h2"},
		Protocol:          "t",
	}
	r := Compute(h)
	// Prefix: t + 13 + i + 01 (1 cipher) + 01 (1 ext) + h2
	if !strings.HasPrefix(r.JA4, "t13i0101h2_") {
		t.Fatalf("expected ALPN token h2 in prefix; got %q", r.JA4)
	}
}

func TestCompute_ALPN_HTTP11_ProducesH1Token(t *testing.T) {
	h := Hello{
		CipherSuites:      []uint16{0x1301},
		Extensions:        []uint16{0x0010},
		SupportedVersions: []uint16{tls.VersionTLS13},
		ALPNProtocols:     []string{"http/1.1"},
		Protocol:          "t",
	}
	r := Compute(h)
	// first+last of "http/1.1" = 'h' + '1' = "h1".
	if !strings.HasPrefix(r.JA4, "t13i0101h1_") {
		t.Fatalf("expected ALPN token h1 in prefix; got %q", r.JA4)
	}
}

func TestCompute_NoALPN_ProducesZeroZeroToken(t *testing.T) {
	h := Hello{
		CipherSuites:      []uint16{0x1301},
		Extensions:        []uint16{0x002b},
		SupportedVersions: []uint16{tls.VersionTLS13},
		ALPNProtocols:     nil,
		Protocol:          "t",
	}
	r := Compute(h)
	if !strings.HasPrefix(r.JA4, "t13i0101") {
		t.Fatalf("unexpected prefix: %q", r.JA4)
	}
	// The 2 chars after "t13i0101" are the ALPN token.
	if r.JA4[8:10] != "00" {
		t.Fatalf("expected ALPN token `00` for missing ALPN; got %q (%q)", r.JA4[8:10], r.JA4)
	}
}

func TestCompute_Deterministic(t *testing.T) {
	h := Hello{
		CipherSuites:      []uint16{0x1301, 0x1302},
		Extensions:        []uint16{0x002b, 0x000d},
		SupportedVersions: []uint16{tls.VersionTLS13},
		Protocol:          "t",
	}
	r1 := Compute(h)
	r2 := Compute(h)
	if r1.JA4 != r2.JA4 || r1.JA4Full != r2.JA4Full {
		t.Fatalf("compute not deterministic: %+v vs %+v", r1, r2)
	}
}

func TestCompute_CipherCountExceeds99_Clamps(t *testing.T) {
	// Build a 120-element cipher list. Count should clamp at 99.
	ciphers := make([]uint16, 120)
	for i := range ciphers {
		ciphers[i] = uint16(0x1000 + i)
	}
	h := Hello{
		CipherSuites:      ciphers,
		Extensions:        []uint16{0x002b},
		SupportedVersions: []uint16{tls.VersionTLS13},
		Protocol:          "t",
	}
	r := Compute(h)
	// positions: t(1) 13(2) i(1) = 4, then 2-digit cipher count at [4:6].
	if r.JA4[4:6] != "99" {
		t.Fatalf("expected clamped cipher count `99`; got %q (%q)", r.JA4[4:6], r.JA4)
	}
}

func TestIsGREASE(t *testing.T) {
	cases := []struct {
		v      uint16
		grease bool
	}{
		{0x0a0a, true},
		{0x1a1a, true},
		{0x2a2a, true},
		{0xeaea, true},
		{0x1301, false},
		{0xc02b, false},
		{0x0000, false},
	}
	for _, tc := range cases {
		if got := isGREASE(tc.v); got != tc.grease {
			t.Errorf("isGREASE(0x%04x) = %v; want %v", tc.v, got, tc.grease)
		}
	}
}

func TestFromClientHelloInfo_Empty(t *testing.T) {
	h := FromClientHelloInfo(nil)
	if h.Protocol != "t" {
		t.Fatalf("expected default protocol t; got %q", h.Protocol)
	}
	// A nil ClientHello still computes (with empty lists).
	r := Compute(h)
	if !strings.HasPrefix(r.JA4, "t00i0000") {
		t.Fatalf("expected t00i0000 prefix for empty hello; got %q", r.JA4)
	}
}

func TestFromClientHelloInfo_WithSNI_Populated(t *testing.T) {
	chi := &tls.ClientHelloInfo{
		CipherSuites:      []uint16{0x1301, 0x1302},
		SupportedVersions: []uint16{tls.VersionTLS13},
		ServerName:        "example.com",
		SupportedProtos:   []string{"h2"},
		SignatureSchemes: []tls.SignatureScheme{
			tls.PKCS1WithSHA256, tls.ECDSAWithP256AndSHA256,
		},
	}
	h := FromClientHelloInfo(chi)
	if !h.SNIPresent {
		t.Fatalf("expected SNIPresent=true when ServerName is set")
	}
	if len(h.ALPNProtocols) != 1 || h.ALPNProtocols[0] != "h2" {
		t.Fatalf("ALPN protocols not carried: %+v", h.ALPNProtocols)
	}
	r := Compute(h)
	if r.JA4[3] != 'd' {
		t.Fatalf("expected SNI `d` flag; got %c in %q", r.JA4[3], r.JA4)
	}
}

func TestAlpnToken_Variants(t *testing.T) {
	cases := []struct {
		name    string
		protos  []string
		want    string
	}{
		{"empty", nil, "00"},
		{"h2", []string{"h2"}, "h2"},
		{"http/1.1", []string{"http/1.1"}, "h1"},
		{"acme-tls/1", []string{"acme-tls/1"}, "a1"},
		{"single empty", []string{""}, "00"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := alpnToken(tc.protos); got != tc.want {
				t.Errorf("alpnToken(%v) = %q; want %q", tc.protos, got, tc.want)
			}
		})
	}
}

func TestSha256Trunc12_EmptyReturnsZeros(t *testing.T) {
	if got := sha256Trunc12(""); got != "000000000000" {
		t.Fatalf("expected all-zero digest for empty input; got %q", got)
	}
}

func TestSha256Trunc12_KnownValue(t *testing.T) {
	// Sanity: SHA-256("1301") — we don't hardcode the full digest, just assert
	// shape + determinism.
	a := sha256Trunc12("1301")
	b := sha256Trunc12("1301")
	if a != b {
		t.Fatalf("sha256Trunc12 not deterministic")
	}
	if len(a) != 12 {
		t.Fatalf("expected 12-char digest; got %q", a)
	}
}
