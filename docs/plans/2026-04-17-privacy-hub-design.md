---
title: Privacy Hub at privacy.whattheflip.lol — Design Doc (v2.1, locked)
date: 2026-04-17
owner: vulnix0x4
status: approved — proceeding to implementation plan
version: v2.1 (post 5-agent verification + owner open-decision pass)
---

# Privacy Hub — Design Doc (v2.1)

> **v2.1 note:** comprehensive rewrite of the initial design doc after a 5-agent verification pass on (a) tech stack current-state, (b) fingerprinting technical claims, (c) live prior-art re-verification, (d) fresh-eyes scope audit, (e) scanner infrastructure — plus owner resolution of all v2 open decisions (framework, publisher identity, AI-scraper stance, VPS provider, nonce store, affiliate URL verification). Every locked-in decision in this doc has been checked against live docs/specs/browser behavior as of April 2026. Change-log summarizing v1→v2→v2.1 is at §19.

## 0. One-line summary

An opinionated, information-first privacy hub that teaches what trackers actually do, shows the visitor what their own browser is leaking (and whether their defenses work), and routes them to the tools that fix each leak — served from `privacy.whattheflip.lol`, with no tracking on the site itself and architectural (not policy-based) no-retention commitments on the scanner.

## 1. Vision and differentiator

Every existing privacy site in this space lands one of four pieces and misses the others:

- **EFF Cover Your Tracks** — light scanner + light education, no remediation, no Defense Mode Profile.
- **BrowserLeaks** — now covers TLS JA4, WebGPU, HTTP/2, and QUIC fingerprinting, but remains a technical reference with no remediation or opinion.
- **Privacy Guides / Techlore / Kuketz** — opinionated tool lists and playlists, no live demonstration of *why*.
- **pixelscan.net / iphey.com / browserscan.net / CreepJS** — the newer scanner wave. Mostly aimed at anti-detect-browser operators verifying their stealth setup; no remediation for privacy-defending users.
- **fingerprint.com demo** — the "we still know you after you cleared" viral moment, but sold as a product *to fingerprint you*, not a tool to defend you.

Our differentiator, restated:

> **Scanner → encyclopedia → remediation, stitched together in one click, with a "you cleared but we still know you" moment as the homepage hook, a Defense Mode Profile (Blocked/Spoofed/Farbled/Quantized/Unchanged) as the headline — not a bit score — and honest per-browser verdict copy that celebrates working defenses instead of punishing them.**

Consolidation in the space during 2024-2025 (The New Oil creator joined Privacy Guides staff; CyberInsider merged with RestorePrivacy on 2025-06-05) has been horizontal — bigger players in existing quadrants — not cross-quadrant stitching. Our four-quadrant combination remains the unfilled gap in April 2026.

## 2. Audience, voice, tone

### 2.0 Audience

The hub serves **both** complete normies and hardcore privacy-obsessed users — simultaneously, without separate tracks. The surface layer reads for normies; the depth rewards nerds.

Three self-selecting entry lanes on the homepage:

1. **Scan yourself** — emotional hook. Works for anyone.
2. **Browse by topic** — intent-driven ("I need a VPN"). Middle audience.
3. **Learn how tracking works** — encyclopedia-first. Nerds and curious normies.

### 2.1 Voice principles

- **Direct, casual, opinionated.** Own picks. "This just works." Occasional "lowkey" (cap: max once per page, only in an aside).
- **Never preachy.** Don't moralize privacy. Demonstrate it.
- **Never condescending.** A normie can follow us without being talked down to.
- **Never afraid of technical detail.** Every page has a technical section, in its own block, not watered down.
- **Honest about limits.** "Perfect anonymity is rare — most users move from *highly unique* to *moderately unique*, and that's still a large privacy improvement."
- **Anti-hype.** No "SHOCKING." No FUD.

### 2.2 Style guide (do's, don'ts, preferred terms)

Hand-off-ready for contributors and AI-assisted drafts.

**Do:**
- Open with the action or payoff, not setup.
- Use second-person ("you") for instructions; first-person plural ("we") only when describing the hub's choices.
- Put the opinion first, caveats after. "Use Mullvad. Here's why."
- Name vendors by name. Don't euphemize.
- Prefer verbs to nouns ("fingerprint identifies you" > "fingerprint identification occurs").
- 3-4 sentences per paragraph max on scanner / encyclopedia surface content.

**Don't:**
- No "In today's digital age…"
- No "hackers" as the villain archetype. The villain is ad-tech and data brokers, named.
- No "SHOCKING," "you won't believe," any clickbait register.
- No moralizing about people who don't care about privacy.
- No "easy" or "simple" promises the guide doesn't deliver. If it takes 20 steps, say 20 steps.
- No scare numbers without a source.
- No em-dashes used lazily as connective tissue. Use a period. (em-dashes for parenthetical asides are fine.)
- No "Let's dive in." No "In this article, we'll explore." Just say the thing.
- No "please note" or "it's important to remember." State the thing; let the reader remember.

**Preferred terms:**
- "Tracker" > "hacker" (for ad-tech context).
- "Leak" > "exposure."
- "Defend" > "protect."
- "Pick" > "choice."
- "Normie" acceptable in nerd-facing passages; "everyday user" for public-facing ones.

**Anti-checklist** (run every draft):
- Could this sentence appear on a corporate security vendor's blog? → rewrite.
- Did I use a word the reader has to look up without defining it? → define or swap.
- Did I hedge a recommendation? → commit or cut.

## 3. Domain and identity

- **Domain:** `privacy.whattheflip.lol` (subdomain of the owner's existing domain).
- **Scanner-backend subdomain:** `*.scan.privacy.whattheflip.lol` (DNS-only, grey-cloud — browser handshakes our VPS directly so we can read raw TLS ClientHello).
- **Branding:** a named section of the `whattheflip` brand. Wordmark-only at launch; logomark optional later.
- **Error pages / 404s** speak in the same voice.

## 4. Information architecture

### 4.1 Top-level nav

```
/                Landing
/scan            Live fingerprint scanner
/vectors         Tracking-vector encyclopedia (main learning spine)
/categories      Tool categories
/scenarios       Threat-model picker / playlists
/guides          Step-by-step how-tos
/basics          Foundations (threat modeling, why privacy, glossary)
/changelog       What's new, what got re-verified, what got de-listed
/about           Methodology, founder note, affiliate disclosure, contact
/legal           Privacy, accessibility, DMCA (see §11)
```

All content URLs reserve **`/en/*`** prefix from day one (`/en/vectors/...`, `/en/categories/...`). Root `/` redirects to `/en/` by Accept-Language with a persistent user override. This costs nothing now and avoids a URL-breaking migration when future locales land.

### 4.2 Homepage structure (`/en/`)

1. **Hero: Ghost Demo.** Single animated card with a client-side-computed fingerprint. Computes **on scroll-into-view of the hero card**, not on page load — no pre-interaction fingerprinting creepiness. `prefers-reduced-motion` users get a static card with a "Compute now" button. Skeleton state (~500ms) while hash computes.
2. **Returning-visitor state.** If the visitor has a prior Ghost Demo hash in IndexedDB, the hero greets them: "Your fingerprint is unchanged" or "Your fingerprint drifted — here's what changed." Huge engagement hook.
3. **Three entry lanes.** Equal-weight cards: "Scan yourself →" / "Browse by topic →" / "Learn how tracking works →".
4. **What's new.** Last 3 `/changelog` entries. Signals active maintenance — the single most important trust signal per prior-art research.
5. **Mission strip.** One paragraph: what the hub is, who it's for, why. Links to `/about`.
6. **Ironic no-cookies banner.** One-line dismissible: "We don't use cookies. Nothing to consent to. [OK]" — the dismissal stored in IndexedDB (not a cookie). Recognized trust signal.

### 4.3 Page-level pattern (applies site-wide)

- **TL;DR block** at top — two sentences a normie can act on.
- **Body** — explainer, tool comparison, defense tiers, etc.
- **Technical detail sections** expand on click. Not hidden, just out of the way.
- **Inline difficulty tags per tool/technique:** 🟢 easy (no install) / 🟡 intermediate (install or configure) / 🔴 advanced (self-host, CLI, threat-model sensitive). (Kuketz-blog uses a 3-tier Einsteiger/Fortgeschrittene/Profis system; ours is not novel, just translated.)
- **`last_verified: YYYY-MM-DD`** in frontmatter, surfaced at bottom of every content page. Snake-case, locked. Non-negotiable.
- **Related entries** — at least 2-5 cross-links, enforced by content schema (build fails on fewer than 2 `related:` slugs).
- **"Known limits"** row/section on scanner cards and encyclopedia entries — honest about what the recommendation won't fix.

### 4.4 Three-lane routing

Every topic surfaces in multiple lanes. A visitor who entered via the scanner can click through to the encyclopedia page to learn, then to the category page to pick a fix. A visitor who entered via `/vectors` can click into `/scan` to see their own result for that vector, then into `/categories/browser` to act. One topic, one canonical page, many paths into it.

### 4.5 SEO & discoverability

- **Sitemap**: `app/sitemap.ts` (Next.js built-in) generates from Content Collections at build. Static XML served from Workers Static Assets.
- **robots.txt**: `app/robots.ts` or static `public/robots.txt`. **AI-scraper stance: ALLOW** by default (GPTBot, ClaudeBot, CCBot, Google-Extended, Bytespider, PerplexityBot). Reasoning: opinionated content in LLM answers is evangelism for the hub. This is an explicit, revocable decision — re-evaluate annually.
- **OG/Twitter cards**: `app/**/opengraph-image.tsx` + `twitter-image.tsx` render dynamic per-page cards showing title, category, `last_verified`. Rendered at build time via `next/og`/Satori on the Node runtime (edge runtime for `next/og` is still not supported on OpenNext as of April 2026 — build-time is faster anyway).
- **JSON-LD structured data**, injected via `<script type="application/ld+json">` in each layout:
  - `Article` on every encyclopedia/guide/basics entry.
  - `HowTo` on every guide (SERP-carousel eligible).
  - `FAQPage` on entries with FAQ-shaped "Common misconceptions" sections.
  - `BreadcrumbList` on every `/vectors/*`, `/categories/*`, `/guides/*`, `/scenarios/*`.
  - `WebSite` + `SearchAction` (Pagefind-powered) on root.
  - `Organization` + `Person` on `/about` (publisher-identity decision in §13.5 determines the `Person` field).
- **Canonical tags**: every page exports `alternates.canonical`. The same topic appearing on scanner card + encyclopedia page is always canonical to `/vectors/{slug}`.
- **IndexNow**: on each deploy, POST changed URLs to Bing + Yandex + Seznam via IndexNow API (one endpoint, free, worth adding).
- **hreflang**: v1 emits `hreflang="en"` on every page ready for future locales.

### 4.6 Internationalization posture

English only for v1 content, but infrastructure reserves locale structure:
- **URL prefix: `/en/*` from day one.** Root redirects to `/en/` by Accept-Language with user override.
- **Library: `next-intl`** reserved as the i18n choice (App Router + Workers-runtime compatible).
- No translation in v1. URL structure means adding Spanish later is `/es/*` without breaking English URLs.

## 5. Feature: Live Scanner (`/en/scan`)

### 5.1 Design purpose

Move the visitor from abstract ("websites track you") to concrete ("your canvas hash is `7a3f…`, and here's who uses that"). Emotional hook + learning moment + conversion funnel into the category pages' affiliate-linked tools.

### 5.2 Vector list — v1 locked at 22

Seven families. Severity ordered within family. Every vector ships with a matching encyclopedia page.

**Network (4)**
1. IP address + geolocation
2. DNS resolver + DoH state + leak test
3. WebRTC local IP leak (mDNS obfuscation caveat noted)
4. TLS fingerprint (JA4 — BSD 3-Clause licensed; JA4+ variants are FoxIO 1.1 licensed, we only compute JA4-TLS on the VPS)

**Fingerprint (11)** — the highest-impact family
5. Canvas fingerprinting
6. WebGL fingerprinting (renderer + parameters)
7. **WebGPU adapter info** (`requestAdapterInfo()` — new since v1, Baseline-available in 2026, higher entropy than WebGL)
8. AudioContext fingerprinting
9. Font enumeration (all three techniques: measurement side-channel, `document.fonts.check()` — Chrome behavior differs from Firefox/Safari, `queryLocalFonts()` — Chrome-only)
10. User-Agent + Client Hints (**copy fix: UA-CH supplements, does NOT replace, the UA string; Firefox rejects UA-CH as harmful per mozilla/standards-positions#552; Safari has not shipped it**)
11. Navigator properties (platform, hardwareConcurrency, deviceMemory, maxTouchPoints)
12. Screen / viewport / DPR
13. Timezone + language + locale
14. Speech synthesis voices
15. Media devices enumeration

**Sensors (1)**
16. Battery API (exposed: Chrome/Edge/Chrome-Android. Removed: Firefox, Brave. Never shipped: Safari, iOS Safari.)

**Permissions (1)**
17. Permissions API bitmap (Chromium ≈23 probeable names, Firefox ≈9, Safari ≈5. The *shape* is the fingerprint, not the count.)

**Storage (2)**
18. Third-party cookies + 1st-party storage persistence (CHIPS partitioned cookies noted as a sub-point; Topics API / Privacy Sandbox was wound down by Google in April 2025 — glossary entry only)
19. Supercookie probes (HSTS — universally partitioned; favicon — partitioned in Firefox 85 / Safari / Brave; Chrome debate ongoing)

**Behavioral / Resource-probing (1)**
20. Extension detection (MV3 `use_dynamic_url` nuance for Chrome; Firefox random-UUID leaks via WAR/Referer — Sjösten et al. NDSS 2019 benchmark still holds)

**Cross-site (2)**
21. Referrer + federated-login state probes (distinct from referrer policy nuances)
22. **CDN edge bot-management cookies** (`__cf_bm`, `_abck`, `_px`/`_pxhd` — new since v1, visible in devtools on most high-traffic sites, nobody else explains them cleanly)

### 5.3 Defense Mode Profile — the headline

Above every card, the scanner surfaces a single summary tally:

> `8 Unchanged · 6 Blocked · 3 Farbled · 2 Quantized · 2 Spoofed · 1 Info`

**Five defense states** (NOT a bit score):

| State | Color | Meaning |
|---|---|---|
| `UNCHANGED` | red | Defense not applied; stable fingerprintable value |
| `SPOOFED` | green | Value replaced with a canonical uniform fake (Tor Browser, Mullvad Browser) |
| `FARBLED` | green + dice icon | Value randomized per session/eTLD+1 (Brave) |
| `QUANTIZED` | purple | Value rounded to one of a small fixed bucket set (Firefox FPP — stable per session, larger cohort than spoofed) |
| `BLOCKED` | blue | Value missing/empty because API was blocked (extension, RFP) |
| `INFO-PUBLIC` | gray | Your IP, Accept-Language header, etc. — shown here because every site sees it |
| `INFO-CONTEXT` | gray | Contextual not-really-a-fingerprint information |

**Crucially:** `BLOCKED`, `FARBLED`, `SPOOFED`, and `QUANTIZED` are all celebration states. A Brave user should finish the scanner feeling good about their choice.

### 5.4 Stability probe (5-second in-session probe)

Every JavaScript-accessible vector is read **3× back-to-back** with ~50ms spacing. Classifier:

- All three identical → `STABLE` (fingerprint, spoofed-uniform, quantized, or unchanged)
- Reads differ → `JITTERED` → `FARBLED`
- All three throw/empty → `ABSENT` → `BLOCKED`

For `STABLE` results, a secondary check compares against known FPP bucket sets and known canonical spoof values to split `SPOOFED` vs `QUANTIZED` vs `UNCHANGED`.

This probe is the scanner's single most important technical decision. It detects Firefox FPP and Brave farbling **without requiring a rescan** and solves "every other tool penalizes Brave users" in one stroke.

### 5.5 Per-browser verdict templates

Scanner detects browser family and emits tailored copy. Templates for:

- **Vanilla Chrome / Edge** (ETP-equivalent N/A): "Sites can fingerprint you on N vectors. Here's the shortest path to cut that in half."
- **Brave strict**: "Brave is doing its job. N vectors are farbled. Note: 2025 research ('Breaking the Shield') showed averaging attacks can defeat single-read farbling — your per-session identity still rotates, but dedicated trackers can partially reconstruct."
- **Brave standard**: partial farbling coverage; different template.
- **Firefox + RFP**: "You're in the small RFP user cohort. Uniform quantization kicks in; expect some sites to break."
- **Firefox + FPP (ETP Strict or private browsing)**: "Your browser is quantizing canvas, fonts, and hardware properties to common buckets. This is Firefox's default fingerprinting protection since v145. It's strong on a set of named vectors and passive on others."
- **Firefox + ETP Standard** (the modal Firefox user): "You're running Firefox's default Enhanced Tracking Protection. FPP is NOT active in Standard mode — your browser is closer to vanilla Chrome than most Firefox users assume. Switch to Strict to enable FPP."
- **Tor Browser**: "You joined the Tor bucket. Your browser matches every other Tor Browser user on this major version — that's the win. Your network path is also onion-routed."
- **Mullvad Browser**: "Tor Browser's uniformity without the Tor network. Your bucket is smaller than Tor's (WebRTC and media devices stay enabled) — Mullvad is its own fingerprint, not Tor's."
- **LibreWolf**: tracks Firefox; detected by build string.
- **Safari**: "Safari 26 ships Advanced Fingerprinting Protection (AFP) enabled everywhere by default — canvas/WebGL/AudioContext/speech readbacks get protection under known-fingerprinter scripts."
- **Safari + Lockdown Mode**: tightened template.
- **Unknown / custom builds**: fallback per-vector copy.

### 5.6 Permission-gated extended tests

Sensors (motion/orientation), local fonts, media-device labels, clipboard, Bluetooth — all behind a "Run deep scan" button with a pre-flight modal explaining what will prompt and that declining is a win.

### 5.7 Scan history (IndexedDB)

- Up to 10 scans retained, user-typed label per scan ("vanilla Chrome", "+ uBlock", "Brave strict").
- `/en/scan/history` view diffs any two scans with transition labels:
  - `STABLE→STABLE same value` = Unchanged
  - `STABLE→ABSENT` = Newly blocked
  - `JITTERED→JITTERED` = Still farbling (good)
  - `STABLE→QUANTIZED` = Defense newly quantizing
  - `ABSENT→STABLE` = Defense regressed (alarm)
- **Rescan-after-change flow**: scanner detects baseline and guides user through "make a change → come back → rescan."

### 5.8 Share feature — export-only, never server-side

Every share artifact is generated client-side:
- **PNG card** (local download) — Defense Mode Profile tally + browser detected. No IP, no raw hashes, no PII.
- **JSON export** — full scan vector for tweakers to diff locally.
- **URL fragment** — base64 of the *hashed* vector in `#fragment`. Fragments don't hit the server.
- **Embed snippet** — 15-line `<blockquote>` pointing back at `/scan`.
- **Pre-filled tweet text** — "I just ran the privacy.whattheflip.lol scanner. Result: 8 unchanged, 6 blocked, 3 farbled. Try yours: …".
- Pre-flight modal lists exactly what's in each artifact before export.

### 5.9 Uniqueness language — v1

No crowd-sourced dataset (violates no-retention ethos). Honest approach:
- Per-vector labels: `rare` / `common` / `very common` / `in the canonical spoof bucket`.
- Definitions cite Laperdrix 2020 (ACM TWEB, DOI 10.1145/3386040), Gómez-Boix 2018 (WWW 2018, DOI 10.1145/3178876.3186097), and newer work (FP-Radar PoPETs 2022, FP-tracer PoPETs 2024, FPTrace WWW 2025, Wu et al. PoPETs 2025 #0038 on demographic bias).
- For Tor / Mullvad Browser users: Tor Metrics' published DAU counts give a real bucket size.
- "Breaking the Shield" 2025 attack on Brave farbling cited on the canvas-farbling encyclopedia page — honest about defense limits.

## 6. Feature: Ghost Demo (homepage hero)

### 6.1 Flow

1. **Hero appears on page load.** Static by default.
2. **On scroll-into-view of the hero card** (or explicit "Compute now" tap for reduced-motion users), the demo silently computes a lightweight fingerprint (canvas + audio + UA + screen + timezone + fonts) entirely client-side, stores a SHA-256 hash in the user's IndexedDB, displays the last 6 chars on a "your mask" card: `your fingerprint: …c4f2e9`.
3. **Returning visitors** see a greeting comparing their current hash to the stored one: "Unchanged" or "Drifted — here's what changed."
4. CTA: **"Try to hide."** Three options, each with a short explainer:
   - **Clear site data** — actually triggers `caches.delete()`, `indexedDB.deleteDatabase()` (except our own hash, which we document), localStorage/sessionStorage clear, `document.cookie` iteration. Note: `navigator.storage.persist(false)` is NOT a site-data-clear; it only releases the "persistent" bit. (v1 copy fix.)
   - **Open in a private window** — opens a `/scan` popup.
   - **Switch networks/VPN** — instructions only.
5. After the user returns, re-compute, show one of the verdict states described in §5.5 per-browser templates.

### 6.2 Privacy architecture of the demo

- **No server component.** Hash stays in user's IndexedDB.
- **No cookies.** Not even for the ironic banner (stored in IndexedDB).
- **"Clear my fingerprint" button** always visible.
- Banner: "This demo runs entirely in your browser. We don't store or send your fingerprint. [See how →]"

## 7. Tracking-Vector Encyclopedia (`/en/vectors`)

### 7.1 Spine

Info-first means this section is the site's main event. Every other section cross-links in.

### 7.2 Index page

Grouped by 7-family taxonomy, ordered by severity × prevalence within each family. Two-paragraph intro per family.

### 7.3 Per-vector page template (500-1200 words)

```markdown
# [Plain-English Name]
## also known as: [technical name(s)]

> TL;DR — 40-50 words. What it is, what it reveals, what defends against it.
> Severity: CRITICAL | HIGH | MEDIUM | LOW
> Prevalence: Very common | Common | Rare

## How it works (plain English)
## How it works (technical)
## Who uses this, and why
## What it reveals about you
## How to defend
  ### Level 1: Easiest (no install) 🟢
  ### Level 2: Install a free tool 🟡
  ### Level 3: Advanced / paid 🔴
  ### What doesn't help
## Tools that help
## Try it yourself (deep-link to /scan)
## Related vectors
## Further reading (primary research, reference site tests, CreepJS for deep-dive)
## Known limits
---
last_verified: YYYY-MM-DD
```

### 7.4 v1 content: 22 vector entries + 1 meta-entry

22 matching the scanner vector list in §5.2. Plus one additional meta-entry that isn't in the scanner:

- **`/en/vectors/firefox-fpp`** — dedicated entry for Firefox Fingerprinting Protection. Because the scanner's verdict templates name FPP explicitly, readers will click into it. Covers FPP vs RFP, v145 defaults, ETP-Standard vs Strict, the arkenfox v128+ recommendation reversal.

And, honestly surfaced in the index with a "not in the scanner — here's why" tag:

- **`/en/vectors/keystroke-dynamics`** — behavioral/biometric fingerprinting. Out of scope for our passive scanner; encyclopedia-only entry.

Entry titles (SEO-friendly plain-English):

1. **IP Address & Geolocation** — "Your internet's home address, and what it gives away"
2. **Canvas Fingerprinting** — "How websites identify you by how your GPU draws text"
3. **WebGL Fingerprinting** — "The 3D rendering signature that names your graphics card"
4. **WebGPU Fingerprinting** — "The next-gen graphics API has a new fingerprint surface"
5. **TLS Fingerprinting (JA4)** — "Your encrypted handshake has a shape — and sites are reading it"
6. **Font Enumeration** — "The list of fonts on your computer is almost unique"
7. **AudioContext Fingerprinting** — "The inaudible sine wave your computer responds to differently"
8. **User-Agent & Client Hints** — "What your browser announces, and what Chrome's newer header does (and doesn't) replace"
9. **Navigator Properties** — "A dozen little details your browser tells every site"
10. **Screen & Viewport** — "Your monitor, taskbar, and zoom level, in public"
11. **Timezone & Language** — "The two fields that break most VPNs"
12. **Speech Synthesis Voices** — "The TTS voices installed on your device, leaked by default"
13. **Media Device Enumeration** — "Your cameras, mics, and speakers, counted without permission"
14. **Battery API** — "How your battery discharge curve can link your sessions (in some browsers)"
15. **Permissions Bitmap** — "Twenty-ish permission states, one near-unique pattern"
16. **DNS Leaks & DoH State** — "Why a VPN that isn't handling DNS is only half a VPN"
17. **WebRTC Local IP Leak** — "The reason your VPN might not be hiding your real address"
18. **Third-Party Cookies, Storage, CHIPS** — "The classic tracker, slowly dying, and what Chrome replaced it with"
19. **Supercookies (HSTS, ETag, Favicon)** — "Tracking built out of caching primitives"
20. **Extension Detection** — "How sites know you're running uBlock Origin"
21. **Referrer & Federated-Login Probes** — "Where you came from, and whether you're logged into Google right now"
22. **CDN Bot-Management Cookies** — "The `__cf_bm` cookie appearing on every site you visit, explained"
+ `firefox-fpp` — "Firefox's Fingerprinting Protection: what it covers, where it falls short"
+ `keystroke-dynamics` — "Your typing rhythm is a signature — and we don't measure it"

## 8. Categories (`/en/categories`)

### 8.1 Per-category page template

```
[HERO]
  One-sentence framing: what this category protects against.
  Threat-model fit summary.

[THIS JUST WORKS]
  One opinionated pick, inline difficulty tag, inline affiliate disclosure where applicable.

[ALTERNATIVES]
  3-5 picks with capsule reasons. Comparison matrix.

[COMMON MISTAKES]

[SETUP]
  Link to matching /guides/* entry.

[RELATED VECTORS]

[KNOWN LIMITS]

last_verified: YYYY-MM-DD
```

### 8.2 v1 content: 22 category pages

Full starter pack plus gaps that prior-art analysis and the 2026 table-stakes audit surfaced.

1. **Email** — Proton Mail (aff), Tuta, SimpleLogin (aff via Proton)
2. **VPN** — Mullvad (no aff, credibility flex), Proton VPN (aff), IVPN
3. **Browser** — Brave, LibreWolf, Mullvad Browser, Firefox + Arkenfox (FPP default per v128+, not RFP), Tor Browser, Safari 26 (AFP default)
4. **Password Manager** — Bitwarden (aff), Proton Pass (aff), KeePassXC
5. **Hardware Security Keys** (new) — YubiKey, SoloKey, Nitrokey
6. **TOTP / 2FA Apps** (new) — Aegis, 2FAS, Ente Auth, Bitwarden/Proton Pass built-ins
7. **Search Engine** — Kagi (aff), Brave Search, DuckDuckGo, SearXNG self-host
8. **Ad & Tracker Blocking** — uBlock Origin, Pi-hole (self-host), AdGuard Home (self-host)
9. **DNS** — Quad9, NextDNS, Mullvad DNS, self-hosted unbound + Pi-hole
10. **Cloud Storage** — Proton Drive (aff), Tresorit, self-hosted Nextcloud
11. **Photo Storage** (new — split from Cloud Storage) — Ente (aff candidate), Proton Drive (aff), Stingle
12. **Disk Encryption** — VeraCrypt, LUKS, BitLocker (caveats)
13. **Encrypted Backup** (new) — Restic, Borg, Kopia
14. **Notes** — Obsidian (aff if available) + Proton Drive, Standard Notes, Joplin
15. **Encrypted Messaging** — Signal, Session, SimpleX, Matrix
16. **Video Conferencing** (new) — Jitsi, Jami, SimpleX, Signal video
17. **SMS Verification / Temp Numbers** — smspool.net (aff — affiliate URL needs manual browser verification before launch; WebFetch blocked at 403), JMP.chat
18. **Financial Privacy** — Privacy.com (aff), Monero, cash
19. **Data Removal** — Easy Opt Outs, DeleteMe, Incogni — honest comparison
20. **Operating System Privacy (Desktop)** — Windows 11 Debloat (Raphire's script), Linux primers, macOS hardening
21. **Mobile OS** (new — split from #20) — GrapheneOS, CalyxOS, LineageOS
22. **Router & Home Network** (new) — OPNsense, pfSense, GL.iNet, OpenWrt primer

### 8.3 Affiliate rules — locked

1. **Free/OSS first, paid/affiliate second. Always.**
2. **Inline disclosure on every affiliate link** — meets FTC 16 CFR Part 255 "clear and conspicuous." Plus: the TL;DR block of any guide recommending an affiliate tool also names the affiliate relationship (small gray text alone may not clear the bar).
3. **No ranking by commission.** Order is merit-based.
4. **No dark patterns.** No fake urgency.
5. **Public "partnerships we've declined" page.** Names companies.
6. **Mullvad prominently featured as affiliate-refuser** — that refusal is the credibility signal.

### 8.4 Affiliate inventory

**Verified working (April 2026):**
- Proton umbrella: `https://pr.tn/ref/718AE113ZKZG` — ✅ resolves, `referrer=718AE113ZKZG` preserved on redirect.
- Privacy.com: `https://app.privacy.com/join/9YGXX` — ✅ resolves.
- smspool.net: `https://smspool.net/?r=DaC6ZFhJJL` — ⚠️ 403 on automated verification (bot-blocking the test user-agent). **Manual browser test required before launch.**

**To sign up for before launch** (owner task, not a design blocker):
- Bitwarden affiliate
- Brave creator/referral
- Kagi referral
- Proton direct affiliate (separate from `pr.tn/ref`)
- Obsidian (if exists)
- Ente (if exists)
- Easy Opt Outs (verify)

**No affiliate — featured as credibility flex:**
- Mullvad (explicitly refuses affiliates)
- All FOSS: Signal, VeraCrypt, uBlock Origin, Quad9, Pi-hole, AdGuard Home, hagezi, GrapheneOS, LibreWolf, Tor Browser, Restic, Aegis, etc.
- Privacy Guides, The New Oil, PrivacyTools, KYC? Not me! (ally links).

## 9. Scenarios / Threat-model picker (`/en/scenarios`)

### 9.1 Purpose

Remove choice paralysis. A scenario page is a **curated playlist reusing existing encyclopedia + category + guide pages.** No new content — new ordering and framing.

### 9.2 Per-scenario template

```
[HERO] "I'm a [role / situation]" + one-paragraph framing

[YOUR TOP 3] Three highest-leverage actions, each links out

[PLAYLIST] Ordered list of 8-15 items with 1-sentence "why it matters for you"

[GO DEEPER]

[WHAT THIS WON'T PROTECT YOU FROM]

[JURISDICTION NOTE] (where legally relevant — abortion-access, activist, etc.)
```

### 9.3 v1 content: 11 scenarios

Added 4 from the gap audit (domestic-abuse survivor is ethically required given abortion-access inclusion).

1. **Just want privacy basics** — normie 10-swap path
2. **Creator with a stalker** — address obfuscation, platform locks, alias flows
3. **Domestic-abuse survivor** (new) — shared-device threat, stalkerware detection, coercion-aware advice. NNEDV Safety Net framing.
4. **Journalist / source protection** — Signal-first, SecureDrop awareness, metadata hygiene
5. **Activist / protester** — device seizure, Signal, Tor Browser, burner email
6. **Abortion-access seeker** — location privacy, period tracking, search history, payment privacy. **Jurisdiction disclaimer required**: "Laws vary by US state; this is technical privacy, not legal advice. Repro Legal Helpline: 1-844-868-2812."
7. **Person on a monitored school/campus network** (new) — DNS-filter awareness, academic-surveillance aware
8. **Person in a censored country** (new) — Tor bridges, Snowflake, obfs4, Meek, Psiphon
9. **Crypto holder / hardware-wallet user** — hardware wallets, KYC-avoidance, network privacy
10. **Parent protecting kids online** — DNS filtering, router-level tools, Signal for family
11. **Elderly internet user** (new) — phishing-focused, scam-call awareness, password-reuse recovery

Deferred to v1.5 (sensitivity warrants more care): expat cross-jurisdiction, immigrant/undocumented, whistleblower pre-leak, high-net-worth crypto split, small-business owner.

## 10. Guides (`/en/guides`)

Step-by-step, sharp scope, one-problem-one-fix. 600-2000 words each.

### 10.1 Per-guide template

```
[HERO] title + ~time estimate + difficulty tag + prerequisites
[WHAT YOU'LL END UP WITH]
[STEPS] numbered, each with what/why/expected screenshot
[VERIFY IT WORKED] ideally a /scan deep-link
[COMMON PITFALLS]
[WHERE TO GO NEXT]
last_verified: YYYY-MM-DD
```

### 10.2 v1 content: 25 guides

Table-stakes 2026 additions folded in.

1. **Harden Firefox in 15 minutes** — FPP-first (NOT RFP-first per arkenfox v128 reversal); RFP listed as Level 3 with site-breakage warning
2. **Harden Brave: which toggles matter, which are bloat**
3. **Set up Pi-hole in 20 minutes**
4. **Set up AdGuard Home with unbound**
5. **Migrate from Gmail to Proton Mail in a weekend**
6. **Migrate to Bitwarden / Proton Pass** from LastPass / 1Password
7. **Set up SimpleLogin aliases**
8. **De-Google your Android: LineageOS or GrapheneOS primer**
9. **iPhone privacy: the settings that actually matter**
10. **iPhone Lockdown Mode** (new) — separate from #9
11. **Android Private Space / Work Profile** (new)
12. **Set up VeraCrypt**
13. **Debloat Windows 11 with Raphire's script**
14. **Obsidian + Proton Drive notes setup**
15. **Use Privacy.com for subscriptions**
16. **Get off people-search sites (Easy Opt Outs + free DIY)**
17. **Request your data under GDPR/CCPA — template + checklist**
18. **Passkeys primer + per-platform setup** (new) — iCloud Keychain, Google, Bitwarden/Proton Pass
19. **YubiKey first-time setup** (new) — FIDO2, TOTP, static password modes
20. **Tor Browser first-time setup** (new) — bridges, security slider, do's-and-don'ts
21. **Mullvad VPN quickstart** (new)
22. **SimpleX first-time setup** (new)
23. **Recover from an account breach** (new) — triage checklist
24. **Firefox Multi-Account Containers** (new)
25. **Linux daily-driver privacy basics** (new) — flatpak sandboxing, fwupd, DE choice

Deferred to v1.5: OpenWrt guide, email catch-all setup, mass account-deletion automation.

## 11. Basics, Glossary, Changelog, About, Legal

### 11.1 `/en/basics`

- **"What is a threat model? Choose yours in 6 questions."** — EFF SSD-structured, 800-1200 words.
- **"Why privacy matters (without the doom)."** — 600 words, grounded, non-preachy.
- **"How to read this site."** — orientation: lanes, difficulty tags, scanner.
- **Glossary** — 50+ terms, inline dotted-underline tooltip hover on other pages, plus own page with deep-links.

### 11.2 `/en/changelog`

Reverse-chronological MDX. Each entry: date + category tag + short note. Homepage surfaces the last 3.

**Example entries** (with corrected cadence — quarterly re-verify, not 16-day):
- `2026-04-17` · **Launch.** 22 encyclopedia entries, 22 categories, 11 scenarios, 25 guides.
- `2026-07-17` · **Quarterly re-verification** of 22 category pages (next: 2026-10-17).
- `2026-08-03` · **De-listed [Tool X]** — [reason]. Graveyard entry at `/en/changelog/graveyard`.
- `2026-09-12` · **New vector entry** — [X].

### 11.3 `/en/about`

- **Founder note.** Publisher identity decision is locked in §13.5.
- **Methodology** — how tools are evaluated, quarterly re-verification process, de-listing criteria.
- **Affiliate disclosure** — long-form, names every partner, names declined partners, explains "free-first" rule.
- **No-tracking commitment** — summary; deep-link to `/en/about/scanner-privacy`.
- **Contact** — `contact@privacy.whattheflip.lol`, a Signal handle, **required PGP key** (promoted from v1's "optional").
- **Warrant canary** — monthly-rotated line: "As of YYYY-MM-DD we have not received any legal requests to suppress content or identify users." Low-cost, high-signal.

### 11.4 `/en/about/scanner-privacy`

Long-form. Includes:
- Every endpoint the scanner hits + what data leaves the browser.
- Lifetime of each data point (60 seconds in memory, ≤2 minutes to full edge-cache purge — honest reframe of KV eventual-consistency).
- The exact Caddy + NSD configs (directly linked to the public scanner repo).
- Link to open-source scanner backend repo (public from launch).
- Workers `observability.enabled = false` commitment — named (see §12).
- Commitment: **6-month lightweight third-party infra review + 24-month deep code/pentest audit.** Auditor names and reports published on this page.
- **Quarterly asciinema attestation** — fixed-time SSH recording of the prod box (`journalctl --no-pager | wc -l`, `ls /var/log`, `systemctl status`, `cat /etc/caddy/Caddyfile`), committed under `attestations/YYYY-MM-DD.cast` in the public scanner repo.
- **Reproducible Go builds**: `-trimpath -ldflags="-buildid= -s -w"`; SHA-256 of shipping binary in every release.
- **Tripwire demo**: refresh after a scan → your nonce is gone. Proof.

### 11.5 `/en/legal` (new section)

- **`/en/legal/privacy`** — data practices (with Cloudflare edge-logs honestly disclosed), controller identity, DSR path (even with nothing to return, the form exists), UK GDPR / CCPA / LGPD / PIPEDA minimum postures consolidated.
- **`/en/legal/affiliate`** — long-form affiliate disclosure (also linked from /en/about).
- **`/en/legal/accessibility`** — WCAG 2.2 AA declared target; progress tracked; contact for a11y issues.
- **`/en/legal/dmca`** — DMCA agent address, counter-notice template, "we do not silently amend under legal threat" policy.
- **Footer** on every page carries **"This is not legal advice"** + locale/jurisdiction note.

## 12. Technical stack (verified current April 2026)

### 12.1 Locked versions

- **Astro 6** — Cloudflare first-party on Workers since 2026-01-16 acquisition. Ships 0 KB JS on static pages by default; React islands hydrate only where needed. Content Collections, Pagefind, `prefers-reduced-motion` are Astro-native conventions.
- **React 19** — used exclusively inside islands (scanner UI, Ghost Demo, interactive widgets). The 60+ content pages (vectors, categories, scenarios, guides, basics) are static `.astro` / `.mdx` with zero JS unless they embed an island.
- **TypeScript ≥5.4**
- **Tailwind CSS v4** (CSS-based `@theme` config, `@import "tailwindcss"`, via `@astrojs/tailwind`)
- **Motion v12** (motion.dev, formerly Framer Motion; imported from `motion/react` inside React islands only — never leaks into static pages)
- **CSS `scroll-behavior: smooth`** (Lenis dropped — a11y footgun, anchor-link breakage, native CSS covers 80% of the win at zero bytes)
- **Astro Content Collections** (first-party; Zod schemas for frontmatter validation — replaces Velite/Content Collections from earlier drafts, no third-party library needed)
- **Pagefind** — static build-time search; runs after `astro build`, before `wrangler deploy`. Pagefind is an Astro convention; reference implementations are Astro-based.
- **Lucide** — `lucide-react` inside islands; `lucide`-generated static SVGs inlined into `.astro` components on static pages (zero JS for icons on content pages).
- **Local WOFF2 fonts** — Inter + JetBrains Mono committed to `/public/fonts`, loaded via `@font-face` (no Google Fonts, even at build time).
- **Cloudflare Workers** via `@astrojs/cloudflare` adapter (official first-party adapter post-acquisition).
- **Cloudflare KV** namespace for scanner nonces (60s `expirationTtl`; claim on about page: "≤2 minutes to fully purge from edge caches" — honest reframe of eventual-consistency window).
- **npm**

### 12.2 Wrangler + Workers configuration

```jsonc
// wrangler.jsonc
{
  "compatibility_date": "2026-04-01",   // ≥ 2024-09-23 required
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": false                     // CRITICAL — default is enabled with 100% sampling
  },
  "kv_namespaces": [
    { "binding": "SCAN_NONCES", "id": "..." }
  ],
  "assets": {
    "directory": "dist",                 // Astro build output
    "binding": "ASSETS",
    "run_worker_first": false
  }
}
```

Named commitment on `/en/about/scanner-privacy`: **`observability.enabled = false`**. Without this, Workers retains request/response metadata for 3-7 days (default-on on all new Workers) and the "no retention" claim is technically false.

Astro middleware lives at `src/middleware.ts` (different lifecycle and API from Next.js middleware — no deprecation concerns for v1).

### 12.3 Dependencies explicitly rejected

- Google Analytics, Plausible, Fathom, any JS analytics
- Any third-party embed (Twitter, YouTube, FB, etc.)
- Any third-party CDN for JS libraries (everything bundled)
- Google Fonts (build-time or runtime)
- Sentry, LogRocket, session-replay tooling
- Any chat widget (Intercom, Crisp, etc.)
- **Cloudflare Turnstile on scanner routes** — it's a third-party script from `challenges.cloudflare.com`. Violates the "zero third-party scripts" invariant. Use Cloudflare Advanced Rate Limiting (server-side, invisible to client) keyed on nonce hash, NOT IP.

### 12.4 CI/CD pipeline

```yaml
# .github/workflows/deploy.yml (outline)
jobs:
  deploy:
    steps:
      - checkout
      - setup-node (npm ci)
      - npm run typecheck
      - npm run lint         # eslint flat config
      - npm run astro:check  # type-checks Astro + validates Content Collections frontmatter via Zod
      - npm run test:no-third-party  # asserts every built page makes zero cross-origin fetches
      - npm run build        # astro build (uses @astrojs/cloudflare adapter)
      - npx pagefind --site dist
      - cloudflare/wrangler-action@v3 (deploy)
      - POST changed URLs to IndexNow
```

- `astro check` fails on missing `last_verified`, missing required `related:` entries (minimum 2), Zod schema violations. Non-negotiable gate.
- **Preview URLs per PR** via Cloudflare Workers Git integration (launched July 2025): each branch gets `<branch>-<worker>.<subdomain>.workers.dev`.
- **Island bundle-size budget**: scanner-island gzipped JS must stay under 80 KB; CI gate enforces via `size-limit` or equivalent.

### 12.5 Infrastructure layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE                                                            │
│                                                                        │
│  Zone: privacy.whattheflip.lol                                         │
│  ├─ privacy.whattheflip.lol        (orange-cloud, Worker)              │
│  ├─ *.scan.privacy.whattheflip.lol (grey-cloud, DNS-only → VPS IP)     │
│                                                                        │
│  Workers (Astro on Workers via @astrojs/cloudflare):                   │
│  ├─ observability.enabled = false                                      │
│  ├─ Workers Static Assets (CSS, JS, content, images)                   │
│  ├─ KV binding SCAN_NONCES (60s expirationTtl)                         │
│  └─ No Turnstile. No Web Analytics beacon.                             │
│                                                                        │
│  Advanced Rate Limiting:                                               │
│  └─ /api/scan/* → 100 req/60s keyed on request nonce hash (not IP)     │
│                                                                        │
│  Analytics: zone-level aggregate dashboard is unavoidable              │
│  (Cloudflare counts requests edge-side regardless) — disclosed         │
│  honestly on /en/about/scanner-privacy.                                │
└────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼ (DNS-only: browser TLS-handshakes VPS directly —
                                   necessary because Cloudflare terminates TLS
                                   at the edge and cf.bot_management.ja4 is
                                   Enterprise-only)
┌────────────────────────────────────────────────────────────────────────┐
│  SCANNER VPS                                                           │
│  Hetzner Cloud CAX11 (ARM, 4 GB RAM, 40 GB NVMe, Helsinki €3.79/mo)    │
│  [ alt: 1984 Hosting Reykjavík ~$10/mo for the privacy-brand premium ] │
│                                                                        │
│  ├─ Caddy reverse proxy                                                │
│  │   - auto-HTTPS via Let's Encrypt                                    │
│  │   - global: log { output discard }                                  │
│  │   - per-route: log_skip                                             │
│  │   - systemd drop-in: StandardOutput=null, StandardError=null        │
│  │   - unit: ProtectSystem=strict, ReadOnlyPaths=/etc                  │
│  │                                                                     │
│  ├─ Go handler @ localhost:8080 /ja4-echo                              │
│  │   - reads raw TLS ClientHello                                       │
│  │   - computes JA4 (BSD 3-Clause — no JA4+ variants)                  │
│  │   - returns JSON, never writes disk                                 │
│  │   - reproducible build: -trimpath -ldflags="-buildid= -s -w"        │
│  │                                                                     │
│  ├─ NSD (authoritative for *.scan.privacy.whattheflip.lol)             │
│  │   - "NSD doesn't do any logging" by design (per NLnet Labs docs)    │
│  │   - no query-log subsystem exists at all (not just disabled)        │
│  │   - zone is synthesized via CoreDNS-like template, or rewritten     │
│  │     by a Go sidecar watching KV nonce events                        │
│  │   - alt: CoreDNS with template plugin if simpler wins               │
│  │                                                                     │
│  ├─ /var/log mounted on tmpfs; systemd-journald Storage=volatile       │
│  └─ No Redis, no SQLite, no persistent storage anywhere on this box   │
└────────────────────────────────────────────────────────────────────────┘
```

**Why this split (verified necessary):**
- Cloudflare Workers on non-Enterprise plans cannot expose a real JA4. `request.cf` offers `tlsVersion`, `tlsCipher`, `tlsClientHelloLength`, `tlsClientRandom`, `tlsClientExtensionsSha1` — no full ClientHello. `cf.bot_management.ja4` is Enterprise Bot Management only (multi-thousand $/mo).
- Grey-cloud DNS for `*.scan.privacy.whattheflip.lol` is the only non-Enterprise path for real JA4 — browser handshakes the VPS directly.
- DNS leak test requires an authoritative NS we control to confirm which resolver queried a scan-unique subdomain.
- **NSD chosen over Knot DNS** because NSD has no query-logging subsystem — architectural, not policy. Knot has a `log:` section we'd have to prove we didn't set.
- **Caddy chosen over nginx** because access-logging is off by default in Caddy (stronger audit claim than nginx's "we set access_log off") and auto-HTTPS removes an operational category.

## 13. Privacy architecture and commitments

### 13.1 Non-negotiables

1. **No analytics.** Zero. Not first-party, not self-hosted, nothing.
2. **No third-party scripts.** Every external fetch is a leak vector. Verified at build (`test:no-third-party`).
3. **No tracking cookies.** None. Site sets zero cookies (even the no-cookies banner is dismissed via IndexedDB).
4. **No Cloudflare Turnstile** on user-facing routes.
5. **`observability.enabled = false`** in Workers config — no request retention beyond Cloudflare edge operational logs.
6. **Scanner VPS cannot log, even if we wanted it to**: Caddy access-logging off by default + global `log { output discard }` + systemd `StandardOutput/Error=null` + `/var/log` on tmpfs + `journald Storage=volatile` + NSD has no query-log subsystem + Go handler never writes disk.
7. **Scan nonces expire in ≤2 minutes** (60s KV TTL + edge-cache propagation window). Honestly reframed from the v1 "60 seconds" claim.
8. **Ghost Demo hashes stay in the user's IndexedDB** — our server never sees them.
9. **Scan history stays in user's IndexedDB only.**
10. **Share feature is export-only** — PNG + JSON + URL fragment + embed snippet, all client-generated.

### 13.2 What we do log (honestly disclosed)

- Cloudflare edge keeps standard operational logs. Their policy, not ours. Documented on `/en/about/scanner-privacy` rather than hand-waved.
- Cloudflare zone-level aggregate analytics (dashboard request counts) are unavoidable at the edge. We explicitly disable Web Analytics beacon.
- We commit to **not** enabling sampled page-hit export, even for aggregate stats. (v1 resolved this ambiguity — "we may sample" dropped in favor of firm no.)
- We have no idea who any visitor is. We make no attempt to find out.

### 13.3 Verifiability and attestation

- **Both the site repo and the scanner-backend repo are public** on GitHub from launch.
- Every page's `last_verified` date lives in public git history.
- Scanner backend repo is deep-linked from `/en/about/scanner-privacy` — specific config files link directly.
- **Quarterly asciinema attestation**: recorded walkthrough of prod box, committed under `attestations/`.
- **6-month lightweight third-party infra review** + **24-month deep code/pentest audit.** Auditor names and reports published.
- **Reproducible Go binary**: SHA-256 of the scanner handler in every release.

### 13.4 Affiliate inventory and rules

(See §8.3 and §8.4.)

### 13.5 Threat model of the hub itself

Adversaries that will target the hub, and the design choices that respond to each:

- **Vendor pressure campaigns** (cease-and-desist, SLAPP-adjacent threats, VPN industry astroturfing). **Response:** public policy on `/en/about` — "We publish correction requests and the original evidence; we do not silently amend under legal threat. Every takedown attempt is documented in `/en/changelog` with redacted sender if needed." Pre-drafted counter-notice template in the repo.
- **DMCA abuse to deindex.** **Response:** `/en/legal/dmca` with registered DMCA agent + counter-notice template.
- **Mass-scraping for LLM training.** **Response:** explicit allow-listed per §4.5 (evangelism > gatekeeping). Re-evaluated annually.
- **Publisher-identity targeting.** **Response (locked):** founder note uses **pseudonym only** (`vulnix0x4`) — no full name. Rationale: pressure-reduction on a site that publishes opinionated recommendations against vendor interests. PGP key is the accountability mechanism instead of real-name reveal — required PGP key published in multiple places (about page, social bios, GitHub) with yearly rotation. Consistency of the pseudonym across platforms over time builds the trust that a real name would, without the personal-pressure surface. `schema.org/Person` markup uses the pseudonym as `name`, omits `givenName`/`familyName`.
- **Repo access control:** 2FA required for all GitHub commits, branch protection on `main`, required signed commits on `privacy-hub-scanner` (the backend). Publisher-key rotation plan documented in internal playbook.
- **State-actor interest.** Not assumed to target the hub directly, but assumed to be in the audience. High-risk scenarios (abortion-access, activist, journalist, censored-country) carry jurisdiction disclaimers.
- **Hosting jurisdiction:** Cloudflare US + VPS Helsinki. Documented on `/en/legal/privacy`.
- **Content backup:** beyond git, a periodic IPFS/Arweave archive mirror makes any takedown attempt Streisand-effect-amplified. (Low priority; v1.5 nice-to-have.)

## 14. Design direction

### 14.1 Visual language

- **Dark mode default.** Light mode supported (`prefers-color-scheme: light`).
- **Starting palette** (refined during design pass; locked enough not to be re-litigated):
  - Background: `#0a0a0a`
  - Surface: `#141416`
  - Text primary: `#f5f5f5`
  - Text muted: `#9ca3af` — **WCAG contrast check before ship** (5.4:1 on #141416; passes AA normal and large; borderline AAA).
  - Accent primary: `#22c55e` (green)
  - State colors:
    - `UNCHANGED`: `#ef4444` (red)
    - `SPOOFED`: `#22c55e` (accent green)
    - `FARBLED`: `#22c55e` + dice icon (with SR-labeled)
    - `QUANTIZED`: `#a855f7` (purple)
    - `BLOCKED`: `#3b82f6` (blue)
    - `INFO`: `#9ca3af` (gray, split `INFO-PUBLIC` vs `INFO-CONTEXT` on the card itself)
- **Typography**: Inter (body), JetBrains Mono (code/hash), both self-hosted WOFF2.
- **Density**: generous whitespace on marketing; tighter on scanner/encyclopedia.
- **Motion**: subtle. Scanner cards animate skeleton → result. Ghost Demo hero has intentional motion. **All motion killed under `prefers-reduced-motion: reduce`** — enforced globally via `MotionConfig`.
- **Sharp, not cute.** No cartoonish illustrations. ASCII / geometric / monospaced accents are on-brand.

### 14.2 Accessibility implementation notes (v2 addition)

Target: **WCAG 2.2 AA minimum**, aspirational AAA on body text.

**Keyboard navigation:**
- Every interactive element is reachable via Tab/Shift-Tab.
- Sticky category bar on `/en/scan` ships with `aria-label="Scanner categories"`, uses roving tabindex, right/left arrow switches tabs.
- Escape closes the "Run deep scan" pre-flight modal.
- **Skip-to-content link** as first focusable element on every page — especially important on `/en/scan` with sticky category bar.

**Screen readers:**
- Scan results announce via `aria-live="polite"` region: "Canvas fingerprint, farbled, defense active."
- `aria-busy="true"` on cards during scanning, `aria-busy="false"` when result ready.
- Dice icon on FARBLED state is decorative (`aria-hidden="true"`); text label carries meaning.
- FARBLED/BLOCKED/QUANTIZED states have explicit text labels, not color-only.
- Tested on NVDA+Firefox and VoiceOver+Safari before launch.

**Focus and interaction:**
- `:focus-visible` treatment distinct from hover, high-contrast outline.
- Touch targets 44×44 CSS px minimum.
- All form controls have associated `<label>`s or `aria-label`.

**Motion:**
- One root-level `useReducedMotion()` check wires `MotionConfig` with `transition.duration=0`.
- No CSS parallax, no auto-scroll on card reveal.
- Ghost Demo is static under reduced-motion; "Compute now" button replaces scroll-into-view trigger.

**Heading hierarchy:**
- Every page has exactly one `<h1>`.
- Scanner cards use `<h3>` under a family `<h2>` header.
- Enforced by Content Collections schema on content pages.

**Contrast audit:** automated check in CI (`pa11y` or equivalent) on every build.

## 15. v1 scope — "perfect" reconciled

### 15.1 Launch scope

Everything in §5-§11 ships at launch. No v1.5 phasing of features or sections.

### 15.2 Content production plan (v2 addition)

60-80+ content files for v1 is 3-6 months of solo writing. Reconciling "ship v1 perfect" with solo-operator reality:

**Two-tier minimum per content file:**

- **Launchable** (ship in v1): TL;DR + "How it works (plain English)" + at least one defense link + `last_verified`. ~200-400 words.
- **Full v1** (complete post-launch, visible in /changelog): meets full template word-count. Guides hit template, encyclopedia hits 500-1200 words, scenarios hit full playlists.

Every page ships at Launchable minimum; pages expand over the post-launch 6-week window. A visible banner on expanding entries reads "Expanding this entry — [related].

**Wave sequencing:**
1. **Wave 1 — Structural** (pre-launch, Week 1-2): 22 scenario frames, 22 category hero blurbs + "this just works" pick, 22 vector TL;DRs. ~25% of word count, ~80% of IA.
2. **Wave 2 — Guides** (pre-launch, Week 3-5): all 25 guides to template depth. Highest conversion surface.
3. **Wave 3 — Deepening** (post-launch, Week 6-10): vectors to 500-1200 words, categories to full comparison matrix, scenarios to full playlists.
4. **Wave 4 — Polish** (post-launch, Week 11-12): glossary, basics essays, `/en/about/scanner-privacy` long-form, legal pages.

**Quality gate per file:**
- Content Collections schema passes.
- Links validated (no broken internal refs).
- `last_verified` set.
- ≥1 primary source cited.
- Vale / style-guide linter passes.
- Manual read-through (same-day + 48-hour-later).

**Review loop:** optional spot-review of 5-10 cornerstone pieces (JA4, Firefox FPP, VPN category, abortion-access scenario, Ghost Demo copy) by a trusted privacy-community reader before launch.

### 15.3 Must ship at launch

- [ ] Homepage with Ghost Demo + three lanes + ironic no-cookies banner + returning-visitor state
- [ ] `/en/scan` — 22 vectors, Defense Mode Profile with 5 states (inc. `QUANTIZED`), stability probe, per-browser verdict templates (10+ browser detections), scan history (IndexedDB), permission-gated deep scan, export as PNG/JSON/fragment/embed/pre-filled-tweet
- [ ] `/en/vectors` — index + 22 entries + `firefox-fpp` meta entry + `keystroke-dynamics` not-in-scanner entry
- [ ] `/en/categories` — 22 category pages with opinionated pick + comparison + setup link
- [ ] `/en/scenarios` — 11 scenario playlists (including domestic-abuse survivor and abortion-access jurisdiction disclaimer)
- [ ] `/en/guides` — 25 step-by-step guides (including Passkeys, YubiKey, Tor Browser, Mullvad, SimpleX, breach recovery)
- [ ] `/en/basics` — threat-model, why-privacy, orientation, glossary (50+ terms)
- [ ] `/en/changelog` — initial launch entry + graveyard sub-page
- [ ] `/en/about` + `/en/about/scanner-privacy` — real-name founder note, required PGP, warrant canary, deep-linked repo
- [ ] `/en/legal/*` — privacy, affiliate, accessibility, DMCA
- [ ] Scanner VPS provisioned (Hetzner CAX11 Helsinki), Caddy + Go JA4 handler + NSD running, `/var/log` on tmpfs, configs in public scanner-backend repo
- [ ] Cloudflare Workers deployment with `observability.enabled = false` confirmed in wrangler.jsonc
- [ ] KV namespace bound, 60s nonce TTL, "≤2 minutes edge-cache purge" claim written
- [ ] Advanced Rate Limiting rule on /api/scan/* keyed on nonce hash (not IP)
- [ ] Pagefind index built into static output
- [ ] All content has `last_verified` frontmatter; CI enforces
- [ ] Dark + light mode, reduced-motion support, keyboard navigation, WCAG AA contrast, automated pa11y check in CI
- [ ] `test:no-third-party` CI gate asserting zero cross-origin fetches
- [ ] IndexNow submission on deploy
- [ ] OG/Twitter card generation per page
- [ ] JSON-LD structured data per page type
- [ ] Scanner backend repo public; site repo public; first asciinema attestation committed

### 15.4 Explicitly out of scope for v1

- Newsletter / email digest
- Podcast or video content
- Forum (direct to GitHub issues / Matrix invite on `/en/about`)
- Multi-language (URL structure ready; no translations)
- User accounts of any kind
- Behavioral fingerprinting in the scanner
- Mobile-native app
- Crowd-sourced fingerprint dataset (ethos-violating)
- Calendar / kids-filter / browser-extension-bundle categories
- Expat / immigrant / whistleblower / HNW-crypto / small-business scenarios (sensitivity warrants care)
- Keyboard layout / device posture / getInstalledRelatedApps vectors
- OpenWrt / email catch-all / mass-account-deletion guides
- IPFS/Arweave backup mirror
- Durable Objects for strict delete-on-expire (KV's "≤2 min" is honest enough for v1; DO as v1.5 upgrade if tripwire-demo credibility demands it)

## 16. Success criteria

**Measurable:**
- Lighthouse: 100 performance, 100 accessibility, 100 best-practices on landing + `/en/scan`.
- `test:no-third-party` CI gate passes: zero cross-origin fetches from any built page.
- Scanner baseline (non-permission) completes in <3s on reasonable hardware.
- Scanner VPS: `journalctl --no-pager | wc -l` < 100 lines/day (startup events only); `ls /var/log` empty or near-empty; verified via asciinema before launch.
- Workers `observability` confirmed disabled via `wrangler deployments list` output.
- `pa11y` / `axe` automated a11y check passes on all routes in CI.
- Contrast ratios on text-muted / state colors verified AA minimum.

**Qualitative:**
- A normie can, in 5 minutes, (a) understand why tracking matters and (b) pick one concrete next step.
- A hardcore user can read the JA4 encyclopedia entry and not feel talked down to.
- A Brave user finishes the scanner feeling good about Brave, not alarmed.
- A Firefox ETP-Standard user gets accurate feedback ("you're closer to vanilla Chrome than you think").
- A Tor Browser user gets Tor-bucket copy, not generic verdicts.
- An auditor on `/en/about/scanner-privacy` can independently verify the no-logging claims from the public config and asciinema.

## 17. Risks and mitigations

- **Content production scope** (~60-80 files for v1). **Mitigation:** Launchable/Full-v1 two-tier per §15.2; transparent /changelog tracking of deepening; optional peer spot-review.
- **No-retention claim is existential.** **Mitigation:** architectural (not policy) — NSD with no log subsystem, Caddy log discard, tmpfs `/var/log`, `observability.enabled=false`, reproducible Go binary, quarterly asciinema, 6-month infra audit.
- **Stale content** (#1 killer in this space). **Mitigation:** `last_verified` CI-enforced; quarterly re-verification on changelog; graveyard sub-page; de-list publicly when we drop a tool.
- **Affiliate credibility collapse (CyberInsider trap).** **Mitigation:** free-first rule locked; inline disclosure; TL;DR disclosure on guides; public declined-partnership page; ranking by merit not commission.
- **Vendor SLAPP / DMCA abuse.** **Mitigation:** §13.5 policy, counter-notice template, DMCA agent, warrant canary.
- **Astro 6 major-version upgrades.** Astro has been stable for years; post-Cloudflare-acquisition governance is the one unknown. **Mitigation:** pin major version; watch release notes; test on preview URL before merging.
- **`@astrojs/cloudflare` adapter stability.** First-party post-acquisition, expected to improve. **Mitigation:** pin version; test on preview URL.
- **React island bundle size creep.** Easy to accidentally ship a 200 KB React tree into a small island and lose the whole "Astro ships 0 KB" win. **Mitigation:** CI gate on scanner island (target < 80 KB gzipped); audit with `rollup-plugin-visualizer` before any feature add.
- **Brave farbling defeated by averaging attacks** ("Breaking the Shield" 2025). **Mitigation:** honest disclosure on /en/vectors/canvas-fingerprinting; per-browser verdict template for Brave includes the caveat.
- **smspool.net affiliate URL verification blocked automatically.** **Mitigation:** manual browser test before launch, owner task.

## 18. Open decisions (not launch-blocking)

- **KV vs Durable Objects for scanner nonces.** KV has "≤2 min" edge-cache propagation window. DO has strict delete-on-expire via alarms. **Decision: KV for v1.** Upgrade to DO in v1.5 if the tripwire-demo credibility demands stricter semantics.
- **1984 Hosting Reykjavík vs Hetzner Helsinki** for scanner VPS. **Decision: Hetzner Helsinki for v1** (€3.79/mo, strong Finnish jurisdiction). 1984 is a brand-premium alternative if `/en/about/scanner-privacy` traffic suggests readers would value the Iceland line.
- **Secondary affiliate sign-ups** (Bitwarden, Brave, Kagi, Proton-direct, Easy Opt Outs, Obsidian, Ente) — parallel owner task, not a design blocker. Ship at launch with whichever are live.
- **Third-party audit vendor + cadence.** Commitment is fixed in §11.4/§13.3 (6-month infra + 24-month deep). Vendor choice post-launch.
- **Final palette details, typography micro-choices, wordmark treatment** — refined in design pass, boundaries set in §14.

## 19. Post-verification change-log (v1 → v2)

Every change in this doc from the 2026-04-17 v1 draft, after the 5-agent verification pass:

**Tech stack:**
- Next.js `16.1.1` → `16.2.4` (16.1.1 doesn't exist; 16.2.4 is current April 15, 2026)
- "Framer Motion" → **Motion v12** (motion.dev; `motion/react` import)
- **Lenis dropped** entirely (a11y footgun, no default reduced-motion respect, anchor-link breakage); replaced with CSS `scroll-behavior: smooth`
- Velite → **Content Collections** (larger ecosystem; Fumadocs-compatible escape hatch)
- Fontsource → `next/font/local` with WOFF2
- Added: `compatibility_date ≥ 2024-09-23`, `nodejs_compat` flag, Wrangler ≥ 3.99, `optimizePackageImports: ['lucide-react']`, `@opennextjs/cloudflare` adapter named, `middleware.ts → proxy.ts` note
- Added: §12.4 CI/CD pipeline; §4.5 SEO patterns
- Added: Astro-vs-Next.js acknowledgement in §18

**Infrastructure:**
- **Added `observability.enabled = false`** — CRITICAL. Without this the "no retention" claim was technically false (Workers defaults to 100% sampling with 3-7 day retention).
- Knot DNS → **NSD** (no query-log subsystem by design — architectural not policy)
- VPS choice specified: **Hetzner CAX11 Helsinki** primary; 1984 Hosting Reykjavík as brand-premium alternative
- Caddy chosen over nginx with reasoning (auto-HTTPS; log-off-by-default stronger audit claim)
- Added systemd drop-in specifics (`StandardOutput/Error=null`), `/var/log` on tmpfs, `Storage=volatile`
- **No Turnstile on scanner routes** — it's a third-party script violating the zero-third-party-scripts invariant
- KV TTL claim honestly reframed: "60 seconds" → "≤2 minutes to fully purge from edge caches" (edge-cache eventual consistency window)
- Advanced Rate Limiting keyed on **nonce hash, never IP**
- Reproducible Go build flags specified
- Quarterly asciinema attestation commitment added
- Cloudflare Workers Git integration noted (per-PR preview URLs since July 2025)
- **Both repos public** from launch (site + scanner-backend)

**Fingerprinting content:**
- Scanner vector count: 20 → **22**. Added **WebGPU adapter info** and **CDN bot-management cookies**.
- Defense mode states: 4 → **5**. Added `QUANTIZED` (purple) for Firefox FPP's rounded-to-bucket values.
- Per-browser verdict templates expanded: added **Firefox + FPP**, **Firefox + ETP-Standard** (modal Firefox user, NOT like hardened), **Safari 26 (AFP default)**, **Brave standard** in addition to the v1 set.
- Client Hints copy corrected: UA-CH **supplements** (does not replace) the UA string; Firefox rejects UA-CH as harmful; Safari has not shipped it.
- Fonts: 3 enumeration methods distinguished; Chrome's `check()` behavior differs from Firefox/Safari.
- Permissions: bucket-count corrected (Chromium ~23, Firefox ~9, Safari ~5; shape is fingerprint, not count).
- Battery API: exposure matrix pinned (Chrome/Edge/Chrome-Android; Firefox and Brave removed; Safari never shipped).
- Extension detection: MV3 `use_dynamic_url` nuance + Firefox UUID-leak caveat added.
- JA4 licensing: BSD 3-Clause for JA4-TLS; FoxIO 1.1 for JA4+ variants — we compute only JA4-TLS.
- Added Firefox FPP encyclopedia entry as its own vector-family meta-entry.
- "Breaking the Shield" 2025 Brave-farbling attack cited on canvas page.
- Cited newer papers: FP-Radar 2022, FP-tracer 2024, FPTrace 2025, Wu et al. PoPETs 2025 #0038, Breaking the Shield 2025.

**Prior-art landscape updates:**
- Acknowledged BrowserLeaks now covers JA4/WebGPU/HTTP/2/QUIC — we're not unique on JA4; the scanner-encyclopedia-remediation stitch is the differentiator.
- Added competitors: pixelscan.net, iphey.com, CreepJS (as deep-dive companion to cite in encyclopedia).
- Added ally-link targets: thenewoil.org, nbtv.media.
- Privacy Guides 2025 additions (Activism section, newsroom) noted.
- Kuketz-blog's 3-tier difficulty system acknowledged — our system isn't novel.
- CyberInsider merger timeline pinned (2025-06-05).
- Safari 26 Advanced Fingerprinting Protection (default-everywhere) now influencing `/en/vectors/canvas-fingerprinting` and `/en/categories/browser`.
- Affiliate URL verification completed for Proton and Privacy.com; smspool flagged for manual browser check.

**Scope + structure:**
- Categories: 15 → **22** (added Hardware Security Keys, TOTP Apps, Photo Storage, Encrypted Backup, Video Conferencing, Mobile OS split-out, Router & Home Network).
- Scenarios: 7 → **11** (added Domestic-abuse survivor [ethical imperative], Monitored-network student, Censored-country, Elderly).
- Guides: 15 → **25** (added Passkeys, YubiKey, Tor Browser, Mullvad, SimpleX, breach recovery, Lockdown Mode, Android Private Space, Firefox Containers, Linux daily-driver).
- Added `/en/legal/*` section (privacy, affiliate, accessibility, DMCA).
- Added §2.2 style guide, §4.5 SEO, §4.6 i18n URL structure, §13.5 threat model of the hub itself, §14.2 accessibility implementation notes, §15.2 content production plan.
- i18n URL structure: committed to **`/en/*` prefix from day one** (reservation for future locales).
- **Publisher identity locked: real name** (not pseudonym).
- **PGP key required** (v1 said "optional").
- Warrant canary added.
- Safari 26 AFP noted in Browser category.
- Arkenfox guidance reversal (RFP-inactive default since v128, FPP default) reflected in "Harden Firefox" guide.

**Contradictions reconciled:**
- Snake-case `last_verified` locked (was inconsistent `last-verified` vs `last_verified`).
- Changelog example dates corrected to quarterly (was 16-day cadence).
- Palette declared "starting, not re-litigated" (was both "proposed" and "locked").
- §13 "we may sample" → firm "no sampling." No ambiguity.
- §15 vs §17 phasing tension → resolved via Launchable/Full-v1 two-tier in §15.2.
- Extension detection moved from Behavioral → Behavioral/Resource-probing (new family label); keystroke-dynamics fills Behavioral with its encyclopedia-only entry.
- Ghost Demo clarified: computes **on scroll-into-view**, not on page load. `navigator.storage.persist(false)` corrected — that does not clear site data.
- Share feature expanded to 5 artifacts (PNG + JSON + fragment + embed + tweet-text).

### v2 → v2.1 (post-open-decisions owner pass)

- **Framework: Next.js 16.2.4 → Astro 6.** For a content-heavy site with two interactive islands, Astro ships 0 KB JS on static pages vs Next.js's ~100 KB. Cloudflare owns Astro since 2026-01-16; `@astrojs/cloudflare` is the first-party adapter. React islands hydrate only `/scan` and the Ghost Demo hero. Content Collections is Astro-native (drops the separate library), Pagefind is an Astro convention, `prefers-reduced-motion` is the default. Updated §12.1, §12.2, §12.4, §12.5, §17.
- **Publisher identity: real name → pseudonym only (`vulnix0x4`).** Rationale: pressure-reduction on a site publishing opinionated recommendations against vendor interests. PGP key is the accountability mechanism instead of real-name reveal. Updated §13.5.
- **AI-scraper stance confirmed: allow** (default kept).
- **Scanner VPS confirmed: Hetzner Helsinki** (default kept).
- **KV nonce store confirmed for v1** (DO deferred to v1.5).
- **smspool.net referral URL confirmed working** by owner (manual browser test) — WebFetch 403 blocker resolved.
- **Removed from §18 open decisions:** Astro-vs-Next.js (resolved). Remaining open items are v1-non-blocking (secondary affiliate sign-ups, audit vendor choice, palette micro-refinements).

---

**Approval status:** Owner has answered all v2 open decisions in favor of Astro, pseudonym, allow-AI-scrapers, Hetzner, KV, and confirmed smspool. Design doc v2.1 is the final pre-implementation artifact. Next step: invoke the `writing-plans` skill to produce a sequenced implementation plan with milestones, file scaffolding, and content production order (aligned to the Wave sequencing in §15.2).
