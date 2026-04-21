import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoiceCommand } from '../../../../src/cli/commands/invoice.js';
import { outputResult } from '../../../../src/cli/output.js';
import { libxmljsAvailable } from '../../../../src/validation/xsd-validator.js';
import { KSeFValidationError } from '../../../../src/errors/ksef-validation-error.js';
import { KSeFXsdValidationError } from '../../../../src/errors/ksef-xsd-validation-error.js';

vi.mock('consola', () => ({
  consola: { info: vi.fn(), error: vi.fn(), log: vi.fn(), success: vi.fn(), warn: vi.fn() },
}));

// Pass-through mock so errors bubble out and we can assert on them.
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputKeyValue: vi.fn(),
  outputWarning: vi.fn(),
}));

async function runBuild(args: Record<string, unknown>) {
  return (invoiceCommand.subCommands!.build as any).run!({ args });
}

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stdoutChunks: string[];

beforeEach(() => {
  vi.clearAllMocks();
  stdoutChunks = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf-8'));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

function capturedStdout(): string {
  return stdoutChunks.join('');
}

describe('invoice build — templates', () => {
  it('emits FA3 template and exits without reading input', async () => {
    await runBuild({ template: 'FA3' });
    const out = capturedStdout();
    const parsed = JSON.parse(out);
    expect(parsed.Naglowek.KodFormularza.systemCode).toBe('FA (3)');
    expect(parsed.Fa).toBeDefined();
  });

  it('emits FA2 template', async () => {
    await runBuild({ template: 'FA2' });
    const parsed = JSON.parse(capturedStdout());
    expect(parsed.Naglowek.KodFormularza.systemCode).toBe('FA (2)');
  });

  it('emits PEF template with Invoice root', async () => {
    await runBuild({ template: 'PEF' });
    const parsed = JSON.parse(capturedStdout());
    expect(parsed.Invoice).toBeDefined();
  });

  it('emits PEF_KOR template with CreditNote root', async () => {
    await runBuild({ template: 'PEF_KOR' });
    const parsed = JSON.parse(capturedStdout());
    expect(parsed.CreditNote).toBeDefined();
  });

  it('throws for unknown template schema', async () => {
    await expect(runBuild({ template: 'UNKNOWN' })).rejects.toThrow(/Template must be one of/);
  });
});

describe('invoice build — end-to-end via stdin', () => {
  async function runWithStdin(stdin: string, args: Record<string, unknown>): Promise<void> {
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      (async function* () {
        yield Buffer.from(stdin, 'utf-8');
      })() as unknown as NodeJS.ReadStream,
    );
    try {
      await runBuild({ input: '-', ...args });
    } finally {
      stdinSpy.mockRestore();
    }
  }

  it('round-trips FA3 template through build into valid XML on stdout', async () => {
    // Grab the template first
    await runBuild({ template: 'FA3' });
    const templateJson = capturedStdout();
    stdoutChunks = [];

    await runWithStdin(templateJson, { schema: 'FA3' });
    const xml = capturedStdout();
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<Faktura');
    expect(xml).toContain('<KodFormularza kodSystemowy="FA (3)"');
  });

  it('infers schema from input (PEF) when --schema is absent', async () => {
    await runBuild({ template: 'PEF' });
    const templateJson = capturedStdout();
    stdoutChunks = [];

    await runWithStdin(templateJson, {});
    const xml = capturedStdout();
    expect(xml).toContain('<Invoice');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
  });

  it('dry-run prints summary and does NOT emit XML', async () => {
    await runBuild({ template: 'FA3' });
    const templateJson = capturedStdout();
    stdoutChunks = [];

    await runWithStdin(templateJson, { 'dry-run': true, json: true });
    // outputResult is mocked — assert the summary contract against its calls
    // rather than parsing stdout (which the mock never writes to).
    expect(outputResult).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'FA3',
        sections: expect.arrayContaining(['Naglowek']),
      }),
      { json: true },
    );
    expect(capturedStdout()).not.toContain('<?xml');
  });

  it('accepts YAML input', async () => {
    const yaml = [
      'Naglowek:',
      '  KodFormularza: { systemCode: "FA (3)", schemaVersion: "1-0E", value: FA }',
      '  WariantFormularza: 3',
      '  DataWytworzeniaFa: "2026-04-18T00:00:00Z"',
      'Podmiot1:',
      '  DaneIdentyfikacyjne: { NIP: "1111111111", Nazwa: S }',
      'Fa:',
      '  KodWaluty: PLN',
      '  P_1: "2026-04-18"',
      '  P_2: "FA/2026/001"',
    ].join('\n');

    await runWithStdin(yaml, { format: 'yaml' });
    const xml = capturedStdout();
    expect(xml).toContain('<Faktura');
    expect(xml).toContain('<P_2>FA/2026/001</P_2>');
  });
});

describe('invoice build — error surfaces', () => {
  async function runWithStdin(stdin: string, args: Record<string, unknown>) {
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      (async function* () {
        yield Buffer.from(stdin, 'utf-8');
      })() as unknown as NodeJS.ReadStream,
    );
    try {
      await runBuild({ input: '-', ...args });
    } finally {
      stdinSpy.mockRestore();
    }
  }

  it('rejects with SyntaxError for malformed JSON (exit-code → 2)', async () => {
    await expect(runWithStdin('{bad', {})).rejects.toBeInstanceOf(SyntaxError);
  });

  it('rejects with KSeFValidationError for missing Naglowek (exit-code → 3)', async () => {
    await expect(runWithStdin('{"Fa":{}}', {})).rejects.toBeInstanceOf(KSeFValidationError);
  });

  it('rejects with Node fs error for missing file (exit-code → 5)', async () => {
    await expect(
      runBuild({ input: '/definitely/not/a/real/file-xyz.json' }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('requires input when neither --template nor positional is provided', async () => {
    await expect(runBuild({})).rejects.toThrow(/Input file required/);
  });

  it('rejects an unknown --schema value before serialization', async () => {
    await expect(
      runWithStdin('{"Naglowek":{},"Fa":{}}', { schema: 'BAD' }),
    ).rejects.toMatchObject({
      name: 'KSeFValidationError',
      message: expect.stringContaining('Schema must be one of'),
    });
  });

  it('rejects an unknown --format value before parsing', async () => {
    await expect(
      runWithStdin('{"Naglowek":{},"Fa":{}}', { format: 'yml' }),
    ).rejects.toMatchObject({
      name: 'KSeFValidationError',
      message: expect.stringContaining('Format must be one of'),
    });
  });
});

describe.skipIf(!libxmljsAvailable)('invoice build — --validate-xsd', () => {
  async function runWithStdin(stdin: string, args: Record<string, unknown>) {
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      (async function* () {
        yield Buffer.from(stdin, 'utf-8');
      })() as unknown as NodeJS.ReadStream,
    );
    try {
      await runBuild({ input: '-', ...args });
    } finally {
      stdinSpy.mockRestore();
    }
  }

  it('FA3 template passes XSD validation', async () => {
    await runBuild({ template: 'FA3' });
    const templateJson = capturedStdout();
    stdoutChunks = [];

    await expect(runWithStdin(templateJson, { 'validate-xsd': true })).resolves.toBeUndefined();
    expect(capturedStdout()).toContain('<Faktura');
  });

  it('raises KSeFXsdValidationError when XML does not match the XSD', async () => {
    // Strip required Fa sub-elements to break XSD.
    const bad = JSON.stringify({
      Naglowek: {
        KodFormularza: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
        WariantFormularza: 3,
        DataWytworzeniaFa: '2026-04-18T00:00:00Z',
      },
      Podmiot1: { DaneIdentyfikacyjne: { NIP: '1111111111', Nazwa: 'S' } },
      Fa: { KodWaluty: 'PLN' },
    });

    await expect(runWithStdin(bad, { 'validate-xsd': true })).rejects.toBeInstanceOf(
      KSeFXsdValidationError,
    );
  });
});
