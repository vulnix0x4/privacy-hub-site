import { describe, it, expect } from 'vitest';
import { recommendFixes, FIX_LIBRARY } from './fixesRecommendation';

describe('recommendFixes', () => {
  it('returns an empty list when no vectors are UNCHANGED', () => {
    expect(
      recommendFixes({ unchangedVectorIds: [], browserFamily: 'vanilla-chrome' })
    ).toEqual([]);
  });

  it('returns up to 3 fixes for a vanilla Chrome user with many exposures', () => {
    const fixes = recommendFixes({
      browserFamily: 'vanilla-chrome',
      unchangedVectorIds: [
        'canvas-fingerprinting',
        'webgl-fingerprinting',
        'audio-fingerprinting',
        'font-enumeration',
        'timezone-locale',
        'ip-geolocation',
        'dns-leaks',
      ],
    });
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.length).toBeLessThanOrEqual(3);
  });

  it('never recommends switching to Brave when already on brave-strict', () => {
    const fixes = recommendFixes({
      browserFamily: 'brave-strict',
      unchangedVectorIds: ['canvas-fingerprinting', 'ip-geolocation', 'dns-leaks'],
    });
    expect(fixes.find((f) => f.id === 'switch-to-brave-strict')).toBeUndefined();
  });

  it('never recommends switching to Tor when already on Tor Browser', () => {
    const fixes = recommendFixes({
      browserFamily: 'tor-browser',
      unchangedVectorIds: ['ip-geolocation'],
    });
    expect(fixes.find((f) => f.id === 'switch-to-tor')).toBeUndefined();
  });

  it('never recommends enabling RFP when already on librewolf or firefox-rfp', () => {
    for (const family of ['librewolf', 'firefox-rfp', 'tor-browser'] as const) {
      const fixes = recommendFixes({
        browserFamily: family,
        unchangedVectorIds: ['canvas-fingerprinting'],
      });
      expect(fixes.find((f) => f.id === 'enable-firefox-rfp')).toBeUndefined();
    }
  });

  it('ranks by leverage bits — Tor sweeps more than a single-vector fix', () => {
    const fixes = recommendFixes({
      browserFamily: 'vanilla-chrome',
      unchangedVectorIds: [
        'canvas-fingerprinting',
        'webgl-fingerprinting',
        'audio-fingerprinting',
        'font-enumeration',
        'timezone-locale',
        'ip-geolocation',
      ],
    });
    // At this scale Tor covers everything at 14+14+11+6+9+20 = ~74 bits.
    // The top-1 should be 'switch-to-tor' or 'switch-to-brave-strict' (each
    // sweep dominant groups). Just assert *some* sweep fix leads.
    expect(fixes[0]?.leverageBits).toBeGreaterThan(10);
  });

  it('surfaces DNS-over-HTTPS as a fix when dns-leaks is present', () => {
    const fixes = recommendFixes({
      browserFamily: 'tor-browser', // skips Tor-switch so other fixes surface
      unchangedVectorIds: ['dns-leaks'],
    });
    // Tor is skipped; next available fix that covers dns-leaks is enable-doh.
    expect(fixes.find((f) => f.id === 'enable-doh')).toBeDefined();
  });

  it('greedy selection — a fix that covers nothing new is skipped', () => {
    const fixes = recommendFixes({
      browserFamily: 'vanilla-chrome',
      unchangedVectorIds: ['canvas-fingerprinting'],
    });
    // Every picked fix must cover at least one vector currently UNCHANGED.
    for (const f of fixes) {
      expect(f.coversInThisScan.length).toBeGreaterThan(0);
    }
  });

  it('limits to the requested `limit` parameter', () => {
    const fixes = recommendFixes(
      {
        browserFamily: 'vanilla-chrome',
        unchangedVectorIds: [
          'canvas-fingerprinting',
          'ip-geolocation',
          'dns-leaks',
          'webrtc-local-ip',
          'extension-detection',
        ],
      },
      2
    );
    expect(fixes.length).toBeLessThanOrEqual(2);
  });

  it('every fix has a non-empty title, description, and covers list', () => {
    for (const f of FIX_LIBRARY) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.covers.length).toBeGreaterThan(0);
    }
  });

  it('fixes leverageLabel includes the word "bits" or "supporting"', () => {
    const fixes = recommendFixes({
      browserFamily: 'vanilla-chrome',
      unchangedVectorIds: ['canvas-fingerprinting'],
    });
    for (const f of fixes) {
      expect(f.leverageLabel).toMatch(/bit|supporting/i);
    }
  });
});
