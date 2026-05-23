import { describe, it, expect } from 'vitest';
import * as pkg from '../../../src/index.js';

describe('public API surface (utils)', () => {
  it('re-exports the archive helpers from the package root', () => {
    expect(typeof pkg.createZip).toBe('function');
    expect(typeof pkg.unzip).toBe('function');
    expect(typeof pkg.createTarGz).toBe('function');
    expect(typeof pkg.extractTarGz).toBe('function');
  });

  it('round-trips a TarGz archive through the public exports', async () => {
    const archive = await pkg.createTarGz([{ fileName: 'a.xml', content: Buffer.from('<a/>') }]);
    const files = await pkg.extractTarGz(archive);
    expect(files.get('a.xml')?.toString('utf-8')).toBe('<a/>');
  });
});
