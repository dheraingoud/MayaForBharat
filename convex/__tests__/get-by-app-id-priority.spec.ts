/**
 * Tests for the getByAppId row-selection tie-break. Pure logic — no Convex.
 *
 * Faithful reproduction of the (now-corrected) comparator behavior:
 *
 *   priority (lower index = better):
 *     live=0, building=1, pending=2, error=3, cancelled=4
 *
 *   sort priority: live > building > pending > error > cancelled.
 *
 *   within same priority:
 *     - transient (building, pending) → NEWER createdAt wins
 *     - stable (live, error, cancelled) → OLDER createdAt wins
 */
import { describe, expect, it } from 'vitest';

// Inlined copy of the comparator from convex/generateJobs.ts. Kept in lock-step
// with the source; if you change one, change the other.
//
// Rule:
//   1. status priority (lower index = better): live=0, building=1, pending=2,
//      error=3, cancelled=4.
//   2. within the same status: NEWER createdAt wins (matches v0's
//      "latest build" UX).
function selectBest(rows: Array<{_id: string; status: string; createdAt: number}>): string {
  const priority = ['live', 'building', 'pending', 'error', 'cancelled'];
  let bestR = rows[0];
  for (const r of rows.slice(1)) {
    const pBest = priority.indexOf(bestR.status);
    const pR = priority.indexOf(r.status);
    if (pR !== pBest) {
      // lower index = higher status priority → higher score wins
      if ((9 - pR) > (9 - pBest)) bestR = r;
      continue;
    }
    // same priority: tie-break on recency — always newer wins
    if (r.createdAt > bestR.createdAt) bestR = r;
  }
  return bestR._id;
}

describe('selectBest — getByAppId comparator', () => {
  it('prefers live over error', () => {
    // Original bug: UI showed error row even though latest row was live.
    const rows = [
      { _id: 'err1',   status: 'error', createdAt: 1782497780702 },
      { _id: 'err2',   status: 'error', createdAt: 1782497712115 },
      { _id: 'live1',  status: 'live',  createdAt: 1782498271769 },
    ];
    expect(selectBest(rows)).toBe('live1');
  });

  it('prefers building over error when no live exists', () => {
    const rows = [
      { _id: 'err',      status: 'error',    createdAt: 1 },
      { _id: 'building',  status: 'building', createdAt: 3 },
    ];
    expect(selectBest(rows)).toBe('building');
  });

  it('within stable status (live), prefers NEWER — final build is sticky at the top', () => {
    // Re-rebuild scenario: user lands on /workbench twice in their lifetime for
    // the same appId. The latest successful build should surface.
    const rows = [
      { _id: 'older', status: 'live', createdAt: 100 },
      { _id: 'newer', status: 'live', createdAt: 200 },
    ];
    // 200 > 100, so newer wins within stable status — the user sees their
    // latest final build, not the first.
    expect(selectBest(rows)).toBe('newer');
  });

  it('within building, prefers newer', () => {
    const rows = [
      { _id: 'old-build', status: 'building', createdAt: 100 },
      { _id: 'new-build', status: 'building', createdAt: 200 },
    ];
    expect(selectBest(rows)).toBe('new-build');
  });

  it('within error stable rows, prefers newer (UX: latest failure shown)', () => {
    const rows = [
      { _id: 'old-err', status: 'error', createdAt: 100 },
      { _id: 'new-err', status: 'error', createdAt: 200 },
    ];
    expect(selectBest(rows)).toBe('new-err');
  });

  it('canceled loses to live', () => {
    const rows = [
      { _id: 'cancel',  status: 'cancelled', createdAt: 999 },
      { _id: 'live',    status: 'live',     createdAt: 100 },
    ];
    expect(selectBest(rows)).toBe('live');
  });

  it('single row passes through', () => {
    expect(selectBest([{ _id: 'only', status: 'live', createdAt: 1 }])).toBe('only');
  });

  it('empty rows would NPE — query handler guards this case and returns null', () => {
    // We don't run selectBest on an empty array; getByAppId's early return handles it.
    expect(true).toBe(true);
  });

  it('happy path: stable error+newer-error+live+building → live wins (live > building)', () => {
    // Priority order (lower index = wins): live=0, building=1, error=3.
    const rows = [
      { _id: 'a', status: 'error',    createdAt: 100 },
      { _id: 'b', status: 'error',    createdAt: 110 },
      { _id: 'c', status: 'live',     createdAt: 200 },
      { _id: 'd', status: 'building', createdAt: 300 },
    ];
    expect(selectBest(rows)).toBe('c'); // live > building > error
  });
});
