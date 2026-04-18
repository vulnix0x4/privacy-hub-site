#!/usr/bin/env node
/**
 * Gate 3 — Lighthouse spot-check (report-only).
 *
 * Runs Lighthouse against a handful of representative routes and writes
 * a JSON report per route to ./lighthouse-reports/. Prints a short
 * table of scores (Performance / Accessibility / Best Practices / SEO)
 * for quick human eyeballing.
 *
 * This gate is intentionally NOT a pass/fail: Lighthouse is environment-
 * sensitive (CPU load, network jitter) and flaky in CI. We surface the
 * numbers so we can notice regressions, not block PRs on them.
 *
 * Usage:
 *   $ npm run build
 *   $ node dist/server/entry.mjs &    # preview on 127.0.0.1:4329
 *   $ npm run audit:lighthouse
 *
 * Exit codes:
 *   0 — always (script succeeded at producing reports)
 *   non-zero — only if Lighthouse itself threw (e.g. Chrome failed to launch)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';

const PORT = Number(process.env.LH_PORT ?? 4329);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = resolve(process.cwd(), 'lighthouse-reports');

/** Representative pages — one from each lane. */
const ROUTES = [
  { slug: 'home', path: '/en/' },
  { slug: 'scan', path: '/en/scan/' },
  { slug: 'vector-canvas', path: '/en/vectors/canvas-fingerprinting/' },
];

async function waitForServer(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (res.status < 600) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not respond within ${timeoutMs}ms`);
}

/** Dynamic imports so we don't hard-depend on lighthouse for `test` scripts. */
async function loadLighthouse() {
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  return { lighthouse, chromeLauncher };
}

function formatScore(category) {
  if (!category || typeof category.score !== 'number') return '  ? ';
  return `${Math.round(category.score * 100).toString().padStart(3, ' ')}`;
}

async function runOne(lighthouse, chromeLauncher, route) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const opts = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
    };
    const url = `${BASE}${route.path}`;
    const result = await lighthouse(url, opts);
    const lhr = result.lhr;
    const reportPath = resolve(OUT_DIR, `${route.slug}.json`);
    await writeFile(reportPath, JSON.stringify(lhr, null, 2), 'utf8');
    return {
      route,
      reportPath,
      scores: {
        performance: lhr.categories.performance,
        accessibility: lhr.categories.accessibility,
        'best-practices': lhr.categories['best-practices'],
        seo: lhr.categories.seo,
      },
    };
  } finally {
    await chrome.kill();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // If the caller set LH_SKIP_SERVER we assume the server is already running
  // (CI flow). Otherwise we spawn one ourselves and shut it down on exit.
  let child = null;
  if (!process.env.LH_SKIP_SERVER) {
    const entry = resolve(process.cwd(), 'dist', 'server', 'entry.mjs');
    if (!existsSync(entry)) {
      console.error(`Lighthouse needs a built server. Run \`npm run build\` first.`);
      process.exit(1);
    }
    child = spawn(process.execPath, [entry], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  }

  try {
    await waitForServer(`${BASE}/en/`, 15_000);
    const { lighthouse, chromeLauncher } = await loadLighthouse();

    const rows = [];
    for (const route of ROUTES) {
      process.stdout.write(`auditing ${route.path}… `);
      const result = await runOne(lighthouse, chromeLauncher, route);
      rows.push(result);
      process.stdout.write('done\n');
    }

    // Pretty print
    const head = [
      'route'.padEnd(40),
      'perf',
      'a11y',
      'best',
      'seo ',
    ].join(' | ');
    const sep = '-'.repeat(head.length);
    console.log('\nLighthouse spot-check (report-only)');
    console.log(sep);
    console.log(head);
    console.log(sep);
    for (const row of rows) {
      const s = row.scores;
      console.log(
        [
          row.route.path.padEnd(40),
          formatScore(s.performance).padEnd(4),
          formatScore(s.accessibility).padEnd(4),
          formatScore(s['best-practices']).padEnd(4),
          formatScore(s.seo).padEnd(4),
        ].join(' | ')
      );
    }
    console.log(sep);
    console.log(`Reports written to ${OUT_DIR}`);
  } finally {
    if (child && !child.killed) child.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('lighthouse spot-check failed:', err);
  process.exit(1);
});
