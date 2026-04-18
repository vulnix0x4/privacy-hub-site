// Package ja4 computes the JA4 TLS ClientHello fingerprint per the FoxIO spec:
// https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md (BSD 3-Clause).
//
// This implementation is deliberately minimal: a single pure function taking a
// captured *tls.ClientHelloInfo (+ the extension list and supported-versions
// list that Go's standard library does NOT expose, so callers synthesize those
// or fall back to conservative defaults).
//
// JA4 (as opposed to JA4_r raw) output shape:
//
//	(protocol)(version)(sni)(cipher_count)(extension_count)(alpn) _
//	(sha256_12(ciphers_sorted_csv))                             _
//	(sha256_12(extensions_sorted_csv + "_" + sigalgs_csv))
//
// Example reference: `t13d1516h2_8daaf6152771_b0da82dd1658`.
//
// Privacy discipline: this package does NOT log anything. Callers log nothing
// either. See the main.go handler for the io.Discard wiring.
package ja4

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// Hello carries the JA4-relevant fields captured from a real TLS handshake.
//
// We can't use *tls.ClientHelloInfo alone because Go's standard library does
// not expose the raw extension-ID list, the supported-versions extension, the
// signature-algorithms list, or the elliptic-curves list in that struct. In
// production the main.go handler extracts them via a custom listener that
// peeks the raw handshake bytes before handing off; in tests, they're
// synthesized directly.
//
// All slices are as-observed (hello order); the compute function sorts and
// filters internally.
type Hello struct {
	// CipherSuites as advertised, in hello order (unsorted, unfiltered).
	CipherSuites []uint16
	// Extensions as advertised, in hello order (unsorted, unfiltered).
	Extensions []uint16
	// SupportedVersions from ext 43. Highest wins.
	SupportedVersions []uint16
	// SignatureAlgorithms from ext 13, in hello order (unsorted).
	SignatureAlgorithms []uint16
	// SNI present? (distinct from non-empty — empty SNI is still "present".)
	SNIPresent bool
	// ALPN protocols, in client-preference order. Empty means no ALPN ext.
	ALPNProtocols []string
	// Protocol: "t" for TCP, "q" for QUIC. v1 only supports "t".
	Protocol string
}

// Result is the pair of JA4 strings. `JA4` is the hashed form; `JA4Full` (also
// called JA4_r) is the raw concatenation before hashing — useful for debugging.
type Result struct {
	JA4     string
	JA4Full string
}

// isGREASE reports whether `v` is a GREASE placeholder value per RFC 8701.
// GREASE values have the form 0x?a?a where both nibbles match.
func isGREASE(v uint16) bool {
	return v&0x0f0f == 0x0a0a && (v>>8)&0xff == v&0xff
}

// filterGREASE returns a new slice with all GREASE values removed.
func filterGREASE(in []uint16) []uint16 {
	out := make([]uint16, 0, len(in))
	for _, v := range in {
		if !isGREASE(v) {
			out = append(out, v)
		}
	}
	return out
}

// versionHex maps a TLS protocol version (0x0303 == TLS 1.2, 0x0304 == TLS 1.3,
// etc.) to the 2-char JA4 version token.
func versionHex(v uint16) string {
	switch v {
	case tls.VersionTLS13:
		return "13"
	case tls.VersionTLS12:
		return "12"
	case tls.VersionTLS11:
		return "11"
	case tls.VersionTLS10:
		return "10"
	case 0x0002: // SSL 2.0
		return "s2"
	case 0x0300: // SSL 3.0
		return "s3"
	default:
		return "00"
	}
}

// highestVersion picks the highest non-GREASE version from the list. If empty,
// returns 0.
func highestVersion(versions []uint16) uint16 {
	var best uint16
	for _, v := range versions {
		if isGREASE(v) {
			continue
		}
		if v > best {
			best = v
		}
	}
	return best
}

// alpnToken encodes the ALPN list per JA4: first+last character of the *first
// non-GREASE* ALPN protocol. If the ALPN list is empty or only GREASE,
// returns "00". If the first char is non-ASCII alphanumeric (shouldn't happen
// for real ALPN), falls back to "99" per spec.
func alpnToken(alpns []string) string {
	// Skip GREASE ALPN placeholders. TLS GREASE reserves protocol strings
	// whose bytes look like 0x?A, per RFC 8701 — but Go's net/http passes ALPN
	// strings not raw bytes, so we only need to guard against empty entries.
	var first string
	for _, p := range alpns {
		if p == "" {
			continue
		}
		first = p
		break
	}
	if first == "" {
		return "00"
	}
	f := first[0]
	l := first[len(first)-1]
	if !isAlnumASCII(f) || !isAlnumASCII(l) {
		return "99"
	}
	return string([]byte{f, l})
}

func isAlnumASCII(b byte) bool {
	return (b >= '0' && b <= '9') || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

// twoDigit clamps `n` to [0, 99] and renders as a 2-char zero-padded decimal.
func twoDigit(n int) string {
	if n > 99 {
		n = 99
	}
	if n < 0 {
		n = 0
	}
	return fmt.Sprintf("%02d", n)
}

// hexCSV renders a slice of uint16 as comma-joined 4-char lowercase hex.
func hexCSV(vs []uint16) string {
	if len(vs) == 0 {
		return ""
	}
	parts := make([]string, len(vs))
	for i, v := range vs {
		parts[i] = fmt.Sprintf("%04x", v)
	}
	return strings.Join(parts, ",")
}

// sha256Trunc12 hashes `s` with SHA-256 and returns the first 12 hex chars of
// the digest (6 bytes). Per JA4 spec, an empty input string hashes to "000000000000".
func sha256Trunc12(s string) string {
	if s == "" {
		return "000000000000"
	}
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:6])
}

// ExtensionIDToFilter is the SNI extension type (0x0000). It's excluded from
// the "extensions" list in the JA4 sorted-and-hashed fragment (but its presence
// still drives the `d`/`i` character in the prefix).
const extSNI uint16 = 0x0000

// extALPN is the ALPN extension type (0x0010). Per JA4 spec it IS counted in
// the extension count but IS excluded from the extension hash input (same
// treatment as SNI — "exclude from hash").
const extALPN uint16 = 0x0010

// Compute returns the JA4 fingerprint for the given captured ClientHello.
//
// Determinism: identical inputs always produce identical outputs. No clocks,
// no randomness, no I/O.
func Compute(h Hello) Result {
	protocol := h.Protocol
	if protocol == "" {
		protocol = "t"
	}

	ver := versionHex(highestVersion(h.SupportedVersions))

	sniChar := "i"
	if h.SNIPresent {
		sniChar = "d"
	}

	ciphersFiltered := filterGREASE(h.CipherSuites)
	// Extension count per JA4: count of all non-GREASE extensions, INCLUDING
	// SNI and ALPN (they participate in the count, just not in the hash input).
	extsFiltered := filterGREASE(h.Extensions)

	cipherCount := twoDigit(len(ciphersFiltered))
	extCount := twoDigit(len(extsFiltered))
	alpn := alpnToken(h.ALPNProtocols)

	prefix := protocol + ver + sniChar + cipherCount + extCount + alpn

	// Hash input 1: sorted cipher CSV.
	sortedCiphers := append([]uint16(nil), ciphersFiltered...)
	sort.Slice(sortedCiphers, func(i, j int) bool { return sortedCiphers[i] < sortedCiphers[j] })
	cipherCSV := hexCSV(sortedCiphers)
	cipherHash := sha256Trunc12(cipherCSV)

	// Hash input 2: sorted extension CSV (minus SNI + ALPN) + "_" + sigalgs CSV.
	extsForHash := make([]uint16, 0, len(extsFiltered))
	for _, e := range extsFiltered {
		if e == extSNI || e == extALPN {
			continue
		}
		extsForHash = append(extsForHash, e)
	}
	sort.Slice(extsForHash, func(i, j int) bool { return extsForHash[i] < extsForHash[j] })
	extCSV := hexCSV(extsForHash)

	sigalgsFiltered := filterGREASE(h.SignatureAlgorithms)
	// NB: sigalgs are NOT sorted — they're preserved in hello order per JA4 spec.
	sigCSV := hexCSV(sigalgsFiltered)

	var extHashInput string
	if sigCSV != "" {
		extHashInput = extCSV + "_" + sigCSV
	} else {
		extHashInput = extCSV
	}
	extHash := sha256Trunc12(extHashInput)

	ja4 := prefix + "_" + cipherHash + "_" + extHash
	ja4Full := prefix + "_" + cipherCSV + "_" + extHashInput

	return Result{JA4: ja4, JA4Full: ja4Full}
}

// FromClientHelloInfo is a convenience adapter: given Go's *tls.ClientHelloInfo
// (which exposes CipherSuites, SupportedVersions, ServerName, SupportedProtos),
// synthesize a Hello and compute. The Extensions / SignatureAlgorithms /
// SupportedCurves fields the JA4 spec would like are NOT in ClientHelloInfo,
// so the adapter fills them from the struct's remaining getters where
// possible and leaves them empty otherwise.
//
// In production the main.go handler feeds a Hello directly from a raw
// handshake-byte parse. This adapter is primarily for tests and for graceful
// degradation if the raw parse fails.
func FromClientHelloInfo(chi *tls.ClientHelloInfo) Hello {
	if chi == nil {
		return Hello{Protocol: "t"}
	}
	h := Hello{
		CipherSuites:        append([]uint16(nil), chi.CipherSuites...),
		SupportedVersions:   append([]uint16(nil), chi.SupportedVersions...),
		SignatureAlgorithms: uint16sFromSchemes(chi.SignatureSchemes),
		SNIPresent:          chi.ServerName != "" || sniExtensionLikelyPresent(chi),
		ALPNProtocols:       append([]string(nil), chi.SupportedProtos...),
		Protocol:            "t",
	}
	return h
}

// uint16sFromSchemes flattens []tls.SignatureScheme to []uint16.
func uint16sFromSchemes(ss []tls.SignatureScheme) []uint16 {
	out := make([]uint16, len(ss))
	for i, s := range ss {
		out[i] = uint16(s)
	}
	return out
}

// sniExtensionLikelyPresent is a best-effort check: Go's Conn/ServerName is
// populated from the SNI extension if present. If `ServerName` is empty we
// can't *prove* SNI was present (the client could have sent an empty SNI),
// so we default to false. Tests can construct Hello directly to exercise
// the edge case.
func sniExtensionLikelyPresent(chi *tls.ClientHelloInfo) bool {
	_ = chi
	return false
}
