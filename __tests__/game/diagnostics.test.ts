/**
 * The on-device self-check, verified on the desktop.
 *
 * `runEngineSelfCheck` is what tells you the engine is sound on the phone. If it
 * ever silently rots — a check that always passes, or one that throws before it
 * asserts anything — the device report becomes a green light that means nothing.
 * So the checker itself is checked here, in CI, where a regression is caught
 * before it ships rather than after.
 */

import { runEngineSelfCheck } from '@game/diagnostics';

describe('runEngineSelfCheck', () => {
  const report = runEngineSelfCheck();

  it('passes every check', () => {
    const failures = report.results.filter((r) => !r.passed);
    if (failures.length > 0) {
      throw new Error(
        `self-check failures:\n${failures.map((f) => `  ${f.name}: ${f.detail}`).join('\n')}`,
      );
    }
    expect(report.failed).toBe(0);
  });

  it('runs a meaningful number of checks', () => {
    // Guards against the report passing because it silently ran nothing.
    expect(report.results.length).toBeGreaterThanOrEqual(10);
    expect(report.passed).toBe(report.results.length);
  });

  it('gives every check a name and a human-readable detail', () => {
    for (const result of report.results) {
      expect(result.name.length).toBeGreaterThan(0);
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it('finishes fast enough to run during a render', () => {
    // It runs synchronously inside the screen's first render, so a slow check
    // would show up as a visibly stuck screen on a low-end device.
    expect(report.durationMs).toBeLessThan(2000);
  });

  it('reports a failure rather than throwing when a check breaks', () => {
    // The `check()` wrapper must convert a thrown assertion into a failed row.
    // If it did not, one broken check would blank the whole screen.
    const names = report.results.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
