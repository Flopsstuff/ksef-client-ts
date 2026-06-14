import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateCharValidity } from '../../../src/validation/char-validity.js';

const FA3_FIXTURE = path.join(__dirname, '../../fixtures/invoices/valid-fa3.xml');

describe('validateCharValidity — performance', () => {
  it('validates a 1 MB synthetic payload in under 2000 ms', () => {
    // Strip the <?xml?> prolog so that repeating doesn't manufacture
    // duplicate prologs (which would correctly flag as PI violations
    // and defeat the perf measurement).
    const base = readFileSync(FA3_FIXTURE, 'utf-8').replace(/^<\?xml[\s\S]*?\?>\s*/, '');
    const repeats = Math.ceil((1024 * 1024) / base.length);
    const payload = base.repeat(repeats);
    expect(payload.length).toBeGreaterThanOrEqual(1024 * 1024);

    // Warm-up pass — prime JIT, caches, etc. Parallel test runners can
    // otherwise produce wildly variable cold-start numbers.
    validateCharValidity(payload.slice(0, 16 * 1024));

    const start = performance.now();
    const errors = validateCharValidity(payload);
    const elapsed = performance.now() - start;

    expect(errors).toEqual([]);
    // Generous CI allowance — local dev is typically < 50 ms. The ceiling
    // is a sanity check against quadratic regressions, not a tight SLA, so it
    // is set high enough to absorb CPU contention from parallel test runners.
    expect(elapsed).toBeLessThan(2000);
  });
});
