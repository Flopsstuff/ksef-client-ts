import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { libxmljsAvailable } from '../../src/validation/xsd-validator.js';

// Spawn-based smoke test for `ksef invoice build` — exercises the built CLI
// artifact (dist/cli.js) without network or authentication. Catches bundling,
// entrypoint wiring, template shipping, and exit-code regressions that pure
// unit tests (which mock withErrorHandler) cannot.

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const cliEntry = join(repoRoot, 'dist', 'cli.js');

function run(args: string[], opts: { input?: string } = {}) {
  const result = spawnSync('node', [cliEntry, ...args], {
    input: opts.input,
    encoding: 'utf-8',
    cwd: repoRoot,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('31 - `ksef invoice build` CLI smoke', () => {
  beforeAll(() => {
    if (!existsSync(cliEntry)) {
      throw new Error(
        `Missing ${cliEntry}. Run \`yarn build\` before \`yarn test:e2e\`.`,
      );
    }
  });

  let tmpDir: string;
  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ksef-build-smoke-'));
    return () => rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('--help and --template', () => {
    it('prints help without executing anything (exit 0)', () => {
      const res = run(['invoice', 'build', '--help']);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('--schema');
      expect(res.stdout).toContain('--validate-xsd');
      expect(res.stdout).toContain('--template');
    });

    it('emits each shipped template as parsable JSON', () => {
      for (const schema of ['FA2', 'FA3', 'PEF', 'PEF_KOR']) {
        const res = run(['invoice', 'build', '--template', schema]);
        expect(res.status, `template ${schema} exit`).toBe(0);
        expect(() => JSON.parse(res.stdout)).not.toThrow();
      }
    });

    it('FA3 template round-trips: template → build → valid Faktura XML on stdout', () => {
      const skel = run(['invoice', 'build', '--template', 'FA3']);
      const built = run(['invoice', 'build', '-', '--schema', 'FA3'], { input: skel.stdout });
      expect(built.status).toBe(0);
      expect(built.stdout.startsWith('<?xml')).toBe(true);
      expect(built.stdout).toContain('<Faktura');
      expect(built.stdout).toContain('kodSystemowy="FA (3)"');
    });

    it('PEF template round-trips and infers schema from Invoice root', () => {
      const skel = run(['invoice', 'build', '--template', 'PEF']);
      const built = run(['invoice', 'build', '-'], { input: skel.stdout });
      expect(built.status).toBe(0);
      expect(built.stdout).toContain('<Invoice');
      expect(built.stdout).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
    });
  });

  describe('validation flags', () => {
    it.skipIf(!libxmljsAvailable)('FA3 template passes --validate-xsd end-to-end', () => {
      const skel = run(['invoice', 'build', '--template', 'FA3']);
      const outPath = join(tmpDir, 'fa3.xml');
      const built = run([
        'invoice', 'build', '-', '--schema', 'FA3', '--validate-xsd', '-o', outPath,
      ], { input: skel.stdout });
      expect(built.status).toBe(0);
      expect(existsSync(outPath)).toBe(true);
      expect(readFileSync(outPath, 'utf-8')).toContain('<Faktura');
    });

    it('--validate (Zod) passes for every shipped template', () => {
      for (const schema of ['FA2', 'FA3', 'PEF', 'PEF_KOR']) {
        const skel = run(['invoice', 'build', '--template', schema]);
        const built = run([
          'invoice', 'build', '-', '--schema', schema, '--validate',
        ], { input: skel.stdout });
        expect(built.status, `${schema} validate exit`).toBe(0);
      }
    });

    it('--dry-run exits cleanly and does not emit XML', () => {
      // Consola suppresses pretty output in non-TTY spawns, so we do not assert
      // on human-readable text here. The --json variant below covers the
      // programmatic summary contract.
      const skel = run(['invoice', 'build', '--template', 'FA3']);
      const dry = run(['invoice', 'build', '-', '--dry-run'], { input: skel.stdout });
      expect(dry.status).toBe(0);
      expect(dry.stdout).not.toContain('<?xml');
    });

    it('--dry-run --json writes machine-readable summary', () => {
      const skel = run(['invoice', 'build', '--template', 'FA3']);
      const dry = run(['invoice', 'build', '-', '--dry-run', '--json'], { input: skel.stdout });
      expect(dry.status).toBe(0);
      const parsed = JSON.parse(dry.stdout);
      expect(parsed.schema).toBe('FA3');
      expect(parsed.sections).toContain('Naglowek');
    });
  });

  describe('exit-code matrix', () => {
    it('exit 2 on malformed JSON from stdin', () => {
      const res = run(['invoice', 'build', '-'], { input: '{ not valid' });
      expect(res.status).toBe(2);
    });

    it('exit 2 on malformed YAML from stdin', () => {
      const res = run(['invoice', 'build', '-', '--format', 'yaml'], { input: 'key: : :' });
      expect(res.status).toBe(2);
    });

    it('exit 3 on structural shape error (missing Naglowek)', () => {
      const res = run(['invoice', 'build', '-'], { input: '{"Fa":{}}' });
      expect(res.status).toBe(3);
    });

    it('exit 5 when input file does not exist', () => {
      const res = run(['invoice', 'build', '/definitely/not/a/real/file-zzz.json']);
      expect(res.status).toBe(5);
    });

    it('exit 1 when called without input and without --template', () => {
      const res = run(['invoice', 'build']);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/Input file required|input/i);
    });
  });

  describe('YAML input', () => {
    it('accepts YAML file input (format inferred from .yaml extension)', () => {
      const yamlPath = join(tmpDir, 'invoice.yaml');
      writeFileSync(
        yamlPath,
        [
          'Naglowek:',
          '  KodFormularza: { systemCode: "FA (3)", schemaVersion: "1-0E", value: FA }',
          '  WariantFormularza: 3',
          '  DataWytworzeniaFa: "2026-04-18T00:00:00Z"',
          'Podmiot1:',
          '  DaneIdentyfikacyjne: { NIP: "1111111111", Nazwa: S }',
          'Fa:',
          '  KodWaluty: PLN',
          '  P_1: "2026-04-18"',
          '  P_2: "FA/YAML/E2E"',
        ].join('\n'),
      );
      const res = run(['invoice', 'build', yamlPath]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('<P_2>FA/YAML/E2E</P_2>');
    });
  });
});
