import { describe, it, expect } from 'vitest';
import { exportIncremental } from '../../../src/cli/commands/export-incremental.js';

describe('export-incremental command definition', () => {
  it('has correct metadata', () => {
    expect(exportIncremental.meta?.name).toBe('export-incremental');
    expect(exportIncremental.meta?.description).toContain('Incremental');
  });

  it('defines --from as required', () => {
    const args = exportIncremental.args!;
    expect(args.from).toBeDefined();
    expect(args.from.required).toBe(true);
    expect(args.from.type).toBe('string');
  });

  it('defines optional date and filter args', () => {
    const args = exportIncremental.args!;
    expect(args.to).toBeDefined();
    expect(args.subjectType).toBeDefined();
  });

  it('defines HWM-specific args', () => {
    const args = exportIncremental.args!;
    expect(args.stateFile).toBeDefined();
    expect(args.outputDir).toBeDefined();
    expect(args.maxIterations).toBeDefined();
  });

  it('defines global flags', () => {
    const args = exportIncremental.args!;
    expect(args.env).toBeDefined();
    expect(args.json).toBeDefined();
    expect(args.json.type).toBe('boolean');
    expect(args.verbose).toBeDefined();
    expect(args.timeout).toBeDefined();
    expect(args.nip).toBeDefined();
  });
});
