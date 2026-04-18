# Upstream Caddy — Phase 3 backend wiring

The mini PC runs the Docker stack behind a WireGuard tunnel. The public-facing
server terminates HTTPS for normal web traffic and passes through TCP for
the JA4 scanner endpoint. DNS goes via iptables DNAT at the packet level —
Caddy can't proxy UDP/53 by itself.

Assume the public server's Caddy config lives in `/etc/caddy/Caddyfile` and
that the WireGuard address of the mini PC is `10.0.0.5`. Adjust to taste.

## 1. Main site — HTTPS reverse proxy

Plain Caddyfile, no plugins needed:

```caddyfile
# Main site
privacy.whattheflip.lol {
    reverse_proxy 10.0.0.5:8421
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        Permissions-Policy "interest-cohort=()"
        # Content-Security-Policy is set by the Astro app itself; don't override here.
    }
    # No access log. Design doc §13.1 non-negotiable #3.
    log {
        output discard
    }
}
```

If your Caddy defaults enable the access log, the explicit `output discard`
is the lever that turns it off for this vhost.

## 2. JA4 TCP passthrough — `layer4` plugin

The JA4 scanner terminates TLS **itself** so it can observe the raw
ClientHello. That means Caddy must not touch the bytes — we need the
[`caddy-l4`](https://github.com/mholt/caddy-l4) layer-4 plugin, which handles
matching on SNI and proxying raw TCP.

### Build Caddy with the plugin

```bash
# On the public server (or any build host):
xcaddy build v2.8.4 --with github.com/mholt/caddy-l4@latest
sudo install -o root -g root -m 0755 ./caddy /usr/local/bin/caddy
sudo systemctl restart caddy
```

Verify the plugin loaded:

```bash
caddy list-modules | grep layer4
# Should print several entries starting with "layer4." — if the command
# returns nothing, the build didn't include the plugin.
```

### Caddyfile snippet

The `layer4` directive is a **global option**, so it lives in the top
block, not inside a site block:

```caddyfile
{
    layer4 {
        :443 {
            # Match TLS traffic where the SNI is the JA4 host; everything
            # else falls through to Caddy's normal HTTPS handler below.
            @ja4 tls sni ja4.scan.privacy.whattheflip.lol
            route @ja4 {
                proxy tcp/10.0.0.5:8443
            }
        }
    }
}

# ... existing site blocks stay unchanged ...

privacy.whattheflip.lol {
    reverse_proxy 10.0.0.5:8421
    # ... (snipped, same as §1) ...
}
```

**Why no separate site block for `ja4.scan.privacy.whattheflip.lol`?**
Because we never want Caddy to terminate TLS for that hostname. The
scanner container presents its own (self-signed) cert to the browser;
Caddy stays a dumb TCP pipe. If you add a site block for that hostname,
Caddy will race with the layer4 matcher and you'll end up with Caddy's cert
serving the response, which destroys the fingerprint.

### DNS

`ja4.scan.privacy.whattheflip.lol` is an **A record pointing at the public
server's IPv4**, not at the mini PC. The public server's Caddy is what
answers port 443; it then passes through to the mini PC via WireGuard.

## 3. DNS — iptables DNAT (NOT Caddy)

Caddy does not proxy UDP, and we need both UDP and TCP on port 53 for
authoritative DNS. Use iptables prerouting NAT instead.

On the **public server**:

```bash
sudo iptables -t nat -A PREROUTING -i eth0 -p udp --dport 53 \
    -j DNAT --to-destination 10.0.0.5:5353
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 53 \
    -j DNAT --to-destination 10.0.0.5:5353
sudo iptables -t nat -A POSTROUTING -p udp -d 10.0.0.5 --dport 5353 \
    -j MASQUERADE
sudo iptables -t nat -A POSTROUTING -p tcp -d 10.0.0.5 --dport 5353 \
    -j MASQUERADE

# Allow forwarding between the public iface and the WireGuard iface.
sudo iptables -A FORWARD -i eth0 -o wg0 -p udp --dport 5353 -j ACCEPT
sudo iptables -A FORWARD -i eth0 -o wg0 -p tcp --dport 5353 -j ACCEPT
sudo iptables -A FORWARD -i wg0 -o eth0 -m state \
    --state RELATED,ESTABLISHED -j ACCEPT

# Enable IP forwarding at the kernel level (once, permanently):
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/60-forward.conf
sudo sysctl -p /etc/sysctl.d/60-forward.conf
```

**Survive reboots.** The above `iptables -A` commands are volatile. Persist
them via one of:

- Debian/Ubuntu: `sudo apt install iptables-persistent && sudo netfilter-persistent save`
- RHEL/Fedora: `sudo service iptables save`
- Arch: drop the rules in `/etc/iptables/iptables.rules` and enable the
  `iptables` systemd service
- Manual: a small systemd unit that runs `iptables-restore < /etc/iptables.rules`
  on boot

### DNS delegation

`scan.privacy.whattheflip.lol` is an **NS record** (on Cloudflare,
grey-cloud only) pointing at `ns1.scan.privacy.whattheflip.lol`, which is
itself an A record pointing at the public server's IPv4. That makes our
NSD the authoritative resolver for the subdomain, without Cloudflare
proxying any traffic.

## 4. Verify end-to-end

From any external host:

```bash
# JA4 echo — should return a JSON with a JA4 fingerprint.
curl -k --resolve ja4.scan.privacy.whattheflip.lol:443:<public-ip> \
    https://ja4.scan.privacy.whattheflip.lol/echo

# DNS — should return a SOA from our NSD.
dig @<public-ip> SOA scan.privacy.whattheflip.lol

# DNS nonce resolution — once a nonce is live, the TXT record should answer.
# (Issue a nonce first via curl https://privacy.whattheflip.lol/api/scan/nonce,
# then dig within the 60s TTL.)
dig @<public-ip> TXT <nonce>.scan.privacy.whattheflip.lol
```

If any of the three fails, check:

1. `docker compose ps` on the mini PC — all four services Running + healthy.
2. `docker logs privacy-hub-scanner-nsd --tail 50` — should show nothing
   after startup; NSD is silent by design.
3. `sudo iptables -t nat -L PREROUTING -n -v` on the public server — packet
   counters should increment when you dig.

## 5. Privacy caveats

- The upstream Caddy MUST have access logs off for the JA4 and DNS vhosts.
  The layer4 plugin has no per-connection logs by default, but the HTTPS
  site block (§1) needs the explicit `log { output discard }` or an
  equivalent global setting.
- The `layer4` plugin does log connection errors to stderr; that's
  acceptable because the body (including SNI) is not captured, only the
  fact that a match/route happened.
- iptables counters above are not logs — they're integers in kernel memory
  that reset on reboot. Nothing on disk.
