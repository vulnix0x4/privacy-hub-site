// Command scanner-ja4 serves GET /echo over TLS and returns the caller's JA4
// fingerprint. Terminates TLS itself (so the handler sees the raw
// ClientHelloInfo) with a self-signed cert generated in-memory at startup.
//
// Upstream Caddy must do TCP passthrough for this to be meaningful — the
// fingerprint is the CLIENT's hello as observed at our socket, so any
// TLS-terminating proxy in between destroys the signal.
//
// Privacy discipline (design doc §13.1):
//   - No disk writes. Cert is in-memory.
//   - No request logging. http.Server.ErrorLog is io.Discard; handler logs nothing.
//   - Tmpfs /tmp at the container level catches any stray file.
package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/vulnix0x4/privacy-hub-scanner/ja4"
)

// listenAddr is the host:port the TLS listener binds to inside the container.
const listenAddr = ":8443"

// serverName is the CN/SAN baked into the self-signed cert. Not validated by
// the upstream TCP-passthrough Caddy, but browsers still need a SAN to match
// the SNI they send. Override via JA4_SERVER_NAME.
var serverName = envDefault("JA4_SERVER_NAME", "ja4.scan.privacy.whattheflip.lol")

func main() {
	silentLogger := log.New(io.Discard, "", 0)

	cert, err := generateSelfSignedCert(serverName)
	if err != nil {
		// Stderr here is the only log line we ever emit — a fatal startup error.
		// Once the server is up, silence rules.
		os.Stderr.WriteString("ja4: cert generation failed: " + err.Error() + "\n")
		os.Exit(1)
	}

	// helloCapture is a per-connection thin shim: we install a
	// Config.GetCertificate callback that *also* stashes the captured
	// *tls.ClientHelloInfo in a request-scoped map keyed by the remote
	// addr:port. The HTTP handler pulls it back out.
	var capMu sync.Mutex
	caps := make(map[string]*tls.ClientHelloInfo)

	tlsCfg := &tls.Config{
		MinVersion: tls.VersionTLS12,
		GetCertificate: func(chi *tls.ClientHelloInfo) (*tls.Certificate, error) {
			// Snapshot a copy — after the handshake, Go may reuse the struct.
			snapshot := *chi
			snapshot.CipherSuites = append([]uint16(nil), chi.CipherSuites...)
			snapshot.SupportedVersions = append([]uint16(nil), chi.SupportedVersions...)
			snapshot.SupportedProtos = append([]string(nil), chi.SupportedProtos...)
			snapshot.SignatureSchemes = append([]tls.SignatureScheme(nil), chi.SignatureSchemes...)
			if chi.Conn != nil {
				capMu.Lock()
				caps[chi.Conn.RemoteAddr().String()] = &snapshot
				capMu.Unlock()
			}
			return &cert, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/echo", func(w http.ResponseWriter, r *http.Request) {
		// CORS: allow the Astro site on privacy.whattheflip.lol to call us.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		key := r.RemoteAddr
		capMu.Lock()
		chi := caps[key]
		delete(caps, key)
		capMu.Unlock()

		var h ja4.Hello
		if chi != nil {
			h = ja4.FromClientHelloInfo(chi)
			h.SNIPresent = chi.ServerName != ""
		} else {
			h = ja4.Hello{Protocol: "t"}
		}
		res := ja4.Compute(h)

		payload := struct {
			JA4       string `json:"ja4"`
			JA4Full   string `json:"ja4Full"`
			Timestamp int64  `json:"timestamp"`
		}{
			JA4:       res.JA4,
			JA4Full:   res.JA4Full,
			Timestamp: time.Now().UnixMilli(),
		}
		_ = json.NewEncoder(w).Encode(payload)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"error":"not_found"}`)
	})

	srv := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		TLSConfig:         tlsCfg,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
		ErrorLog:          silentLogger,
	}

	// Background: sweep the capture map every 10s so stale entries don't pile
	// up if a client aborts the handshake before the handler runs.
	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		t := time.NewTicker(10 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				capMu.Lock()
				// Drain — if there's a saturated connection it'll re-populate.
				caps = make(map[string]*tls.ClientHelloInfo)
				capMu.Unlock()
			}
		}
	}()

	// Shutdown on SIGINT/SIGTERM.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		// ListenAndServeTLS with empty cert/key paths because we ship Certificates
		// in TLSConfig.
		if err := srv.ListenAndServeTLS("", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
			os.Stderr.WriteString("ja4: listener failed: " + err.Error() + "\n")
			os.Exit(1)
		}
	}()

	<-sigCh
	close(stop)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	wg.Wait()
}

// generateSelfSignedCert mints an ECDSA P-256 cert with a 1-year validity
// window, CN == SAN == serverName. Entirely in-memory; no disk touched.
func generateSelfSignedCert(serverName string) (tls.Certificate, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, err
	}

	now := time.Now()
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   serverName,
			Organization: []string{"privacy.whattheflip.lol"},
		},
		NotBefore:             now.Add(-1 * time.Hour),
		NotAfter:              now.Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:              []string{serverName},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
		BasicConstraintsValid: true,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, err
	}

	return tls.Certificate{
		Certificate: [][]byte{der},
		PrivateKey:  priv,
		Leaf:        template,
	}, nil
}

func envDefault(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
