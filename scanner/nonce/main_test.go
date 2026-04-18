package main

import (
	"strings"
	"testing"
)

const miniTemplate = `$TTL 5
@ IN SOA ns1.example. hostmaster.example. ( {{SERIAL}} 60 30 3600 5 )
    IN  NS  ns1.example.
{{NONCE_RECORDS}}
`

func TestRenderZone_EmptyNonceList_ProducesValidZone(t *testing.T) {
	got := RenderZone(miniTemplate, nil, 1234567890)
	if strings.Contains(got, "{{SERIAL}}") || strings.Contains(got, "{{NONCE_RECORDS}}") {
		t.Fatalf("markers not interpolated: %q", got)
	}
	if !strings.Contains(got, "1234567890") {
		t.Fatalf("serial missing from output: %q", got)
	}
}

func TestRenderZone_SingleNonce_AddsTxtAndA(t *testing.T) {
	got := RenderZone(miniTemplate, []string{"abc12345"}, 1)
	if !strings.Contains(got, `abc12345 IN TXT "abc12345"`) {
		t.Fatalf("TXT record missing: %q", got)
	}
	if !strings.Contains(got, `abc12345 IN A 127.0.0.1`) {
		t.Fatalf("A record missing: %q", got)
	}
}

func TestRenderZone_UUIDv4_Accepted(t *testing.T) {
	uuid := "550e8400-e29b-41d4-a716-446655440000"
	got := RenderZone(miniTemplate, []string{uuid}, 1)
	if !strings.Contains(got, uuid+" IN TXT") {
		t.Fatalf("UUID not rendered: %q", got)
	}
}

func TestRenderZone_MultipleNonces_AllAppear(t *testing.T) {
	nonces := []string{"aaaaaaaa", "bbbbbbbb", "cccccccc"}
	got := RenderZone(miniTemplate, nonces, 99)
	for _, n := range nonces {
		if !strings.Contains(got, n+" IN TXT") {
			t.Errorf("nonce %q missing from output", n)
		}
	}
}

func TestRenderZone_InjectionAttempt_Filtered(t *testing.T) {
	// An attacker-controlled web container tries to inject a malicious TXT.
	// Characters outside [a-zA-Z0-9-] cause the nonce to be skipped entirely.
	nonces := []string{
		"validnonce",
		"bad\nrecord",                // newline
		"bad\" IN TXT \"ohno",        // quote injection
		"a b c",                      // space
		"x",                          // too short
		strings.Repeat("q", 200),     // too long
	}
	got := RenderZone(miniTemplate, nonces, 1)
	if !strings.Contains(got, "validnonce IN TXT") {
		t.Fatalf("valid nonce dropped: %q", got)
	}
	for _, bad := range nonces[1:] {
		if strings.Contains(got, bad+" IN TXT") {
			t.Fatalf("malicious nonce %q leaked into zone: %q", bad, got)
		}
	}
}

func TestIsValidNonce(t *testing.T) {
	cases := []struct {
		in    string
		valid bool
	}{
		{"abcdefgh", true},
		{"ABCDEFGH", true},
		{"a1b2c3d4", true},
		{"550e8400-e29b-41d4-a716-446655440000", true},
		{"short", false},                   // <8
		{strings.Repeat("a", 65), false},   // >64
		{"has space", false},
		{"has.dot", false},
		{"has/slash", false},
		{"has\nnewline", false},
		{"has\"quote", false},
		{"", false},
	}
	for _, c := range cases {
		if got := isValidNonce(c.in); got != c.valid {
			t.Errorf("isValidNonce(%q) = %v; want %v", c.in, got, c.valid)
		}
	}
}

func TestFingerprint_EmptyAndPopulated(t *testing.T) {
	if got := fingerprint(nil); got != "" {
		t.Errorf("empty list should yield empty fingerprint; got %q", got)
	}
	a := fingerprint([]string{"x", "y", "z"})
	b := fingerprint([]string{"x", "y", "z"})
	if a != b {
		t.Errorf("fingerprint not deterministic: %q vs %q", a, b)
	}
	c := fingerprint([]string{"x", "y", "w"})
	if a == c {
		t.Errorf("fingerprint should change when set changes; both %q", a)
	}
}

func TestItoa(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0"},
		{1, "1"},
		{123, "123"},
		{1234567890, "1234567890"},
		{-5, "-5"},
	}
	for _, tc := range cases {
		if got := itoa(tc.in); got != tc.want {
			t.Errorf("itoa(%d) = %q; want %q", tc.in, got, tc.want)
		}
	}
}

func TestRenderZone_SerialReplacesMultipleMarkers(t *testing.T) {
	tpl := "serial1={{SERIAL}} serial2={{SERIAL}} records={{NONCE_RECORDS}}"
	got := RenderZone(tpl, []string{"aaaaaaaa"}, 42)
	if strings.Count(got, "42") < 2 {
		t.Fatalf("serial didn't replace all occurrences: %q", got)
	}
}
