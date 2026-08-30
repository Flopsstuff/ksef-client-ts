import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { invoiceCommand } from '../../../../src/cli/commands/invoice.js';
import * as output from '../../../../src/cli/output.js';
import * as pdfModule from '../../../../src/pdf/index.js';

// Surface thrown errors instead of process.exit, so we can assert on them.
vi.mock('../../../../src/cli/error-handler.js', () => ({
  withErrorHandler: vi.fn((fn) => fn()),
}));

vi.mock('consola', () => ({
  consola: { level: 0, start: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../../src/cli/client-factory.js', () => ({
  requireSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('../../../../src/cli/config-store.js', () => ({ loadConfig: vi.fn() }));

vi.mock('../../../../src/cli/session-store.js', () => ({
  saveOnlineSessionRef: vi.fn(),
  clearOnlineSessionRef: vi.fn(),
  loadEncryptionData: vi.fn(),
}));

vi.mock('../../../../src/cli/output.js', () => ({
  outputResult: vi.fn(),
  outputTable: vi.fn(),
  outputSuccess: vi.fn(),
  outputKeyValue: vi.fn(),
  outputWarning: vi.fn(),
}));

vi.mock('../../../../src/validation/invoice-validator.js', () => ({
  validate: vi.fn(),
  validateBatch: vi.fn(),
  batchValidationDetails: vi.fn(() => []),
}));

// The CLI lazily `import('../../pdf/index.js')`; vitest applies this mock to
// that dynamic import too (same resolved module).
vi.mock('../../../../src/pdf/index.js', () => ({
  renderInvoicePdf: vi.fn(),
  renderInvoicePdfFromTemplate: vi.fn(),
  renderUpoPdf: vi.fn(),
  detectInvoiceVersion: vi.fn(),
  detectUpoVersion: vi.fn(),
}));

vi.mock('node:fs', () => {
  const m = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
  return { ...m, default: m };
});

const mockedFs = vi.mocked(fs);
const mockedPdf = vi.mocked(pdfModule);
const mockedOutput = vi.mocked(output);

const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const TEMPLATE_JSON = '{"schema":"FA(3)","blocks":[]}';

/**
 * The command reads two files through the same `readFileSync`: the invoice and,
 * with `--template-file`, the template. Route by path so each gets its own body.
 */
function withTemplateFile(templatePath: string, body: string): void {
  mockedFs.readFileSync.mockImplementation((target: string) =>
    target === templatePath ? body : Buffer.from('<Faktura/>'),
  );
}

function runPdf(args: Record<string, unknown>) {
  return (invoiceCommand.subCommands!.pdf as any).run!({ args });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults: file exists, reads to an FA(3) buffer, renders to bytes.
  mockedFs.existsSync.mockReturnValue(true);
  mockedFs.readFileSync.mockReturnValue(Buffer.from('<Faktura/>'));
  mockedPdf.detectInvoiceVersion.mockReturnValue('FA(3)');
  mockedPdf.detectUpoVersion.mockReturnValue(null);
  mockedPdf.renderInvoicePdf.mockResolvedValue(FAKE_PDF);
  mockedPdf.renderInvoicePdfFromTemplate.mockResolvedValue(FAKE_PDF);
  mockedPdf.renderUpoPdf.mockResolvedValue(FAKE_PDF);
});

describe('invoice pdf — CLI wiring', () => {
  it('errors when the input file does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false);
    await expect(runPdf({ file: 'missing.xml' })).rejects.toThrow(/File not found/);
  });

  it('rejects when both --template and --template-file are given', async () => {
    await expect(
      runPdf({ file: 'invoice.xml', template: 'fa3-default', templateFile: './t.json' }),
    ).rejects.toThrow(/mutually exclusive/);
  });

  it('rejects an invalid --locale', async () => {
    await expect(runPdf({ file: 'invoice.xml', locale: 'de' })).rejects.toThrow(/Invalid --locale/);
  });

  // An unrecognized environment resolves to the production QR host, so without
  // this the command would print a production code on a test invoice and report
  // success — the one failure mode a reader cannot see on the page.
  it('rejects an unknown --env instead of falling back to production', async () => {
    await expect(runPdf({ file: 'invoice.xml', qr: true, env: 'staging' })).rejects.toThrow(
      /Invalid --env "staging"\. Valid: prod, test, demo/,
    );
    expect(mockedPdf.renderInvoicePdf).not.toHaveBeenCalled();
  });

  it.each(['prod', 'test', 'demo'])('accepts --env %s', async (env) => {
    await runPdf({ file: 'invoice.xml', qr: true, env });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'fa3-default',
      expect.objectContaining({ env }),
    );
  });

  it('defaults to fa3-default for an FA(3) document and writes next to the source', async () => {
    await runPdf({ file: 'dir/invoice.xml' });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'fa3-default',
      expect.objectContaining({ locale: 'pl', qr: false }),
    );
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith('dir/invoice.pdf', FAKE_PDF);
    expect(mockedOutput.outputSuccess).toHaveBeenCalled();
  });

  it('defaults to fa2-default for an FA(2) document', async () => {
    mockedPdf.detectInvoiceVersion.mockReturnValue('FA(2)');
    await runPdf({ file: 'invoice.xml' });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(expect.any(Uint8Array), 'fa2-default', expect.anything());
  });

  it('uses a named built-in template with --template', async () => {
    await runPdf({ file: 'invoice.xml', template: 'fa3-default' });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(expect.any(Uint8Array), 'fa3-default', expect.anything());
  });

  it('uses a custom template file with --template-file', async () => {
    withTemplateFile('./custom.json', TEMPLATE_JSON);
    await runPdf({ file: 'invoice.xml', templateFile: './custom.json' });
    expect(mockedPdf.renderInvoicePdfFromTemplate).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      JSON.parse(TEMPLATE_JSON),
      expect.anything(),
    );
    expect(mockedPdf.renderInvoicePdf).not.toHaveBeenCalled();
  });

  // The renderer no longer reads the disk, so the CLI owns both the read and
  // the message a bad path produces.
  it('reports a template file it cannot read, naming the path', async () => {
    mockedFs.readFileSync.mockImplementation((target: string) => {
      if (target === './absent.json') throw new Error('ENOENT: no such file or directory');
      return Buffer.from('<Faktura/>');
    });
    await expect(runPdf({ file: 'invoice.xml', templateFile: './absent.json' })).rejects.toThrow(
      /Failed to read template file "\.\/absent\.json"/,
    );
    expect(mockedPdf.renderInvoicePdfFromTemplate).not.toHaveBeenCalled();
  });

  it('reports a template file that is not valid JSON', async () => {
    withTemplateFile('./broken.json', '{ not json');
    await expect(runPdf({ file: 'invoice.xml', templateFile: './broken.json' })).rejects.toThrow(
      /Failed to read template file "\.\/broken\.json"/,
    );
  });

  it('honors an explicit --out path', async () => {
    await runPdf({ file: 'invoice.xml', out: '/tmp/result.pdf' });
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith('/tmp/result.pdf', FAKE_PDF);
  });

  it('renders a UPO document when --upo is set', async () => {
    await runPdf({ file: 'upo.xml', upo: true });
    expect(mockedPdf.renderUpoPdf).toHaveBeenCalled();
    expect(mockedPdf.renderInvoicePdf).not.toHaveBeenCalled();
  });

  it('auto-detects a UPO document (no invoice version, UPO version present)', async () => {
    mockedPdf.detectInvoiceVersion.mockReturnValue(null);
    mockedPdf.detectUpoVersion.mockReturnValue('UPO(4.3)');
    await runPdf({ file: 'upo.xml' });
    expect(mockedPdf.renderUpoPdf).toHaveBeenCalled();
  });

  it('honors --template for a UPO document instead of the default UPO renderer', async () => {
    mockedPdf.detectInvoiceVersion.mockReturnValue(null);
    mockedPdf.detectUpoVersion.mockReturnValue('UPO(4.3)');
    await runPdf({ file: 'upo.xml', template: 'upo-4_2' });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(expect.any(Uint8Array), 'upo-4_2', expect.anything());
    expect(mockedPdf.renderUpoPdf).not.toHaveBeenCalled();
  });

  it('honors --template-file alongside an explicit --upo', async () => {
    withTemplateFile('./custom-upo.json', TEMPLATE_JSON);
    await runPdf({ file: 'upo.xml', upo: true, templateFile: './custom-upo.json' });
    expect(mockedPdf.renderInvoicePdfFromTemplate).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      JSON.parse(TEMPLATE_JSON),
      expect.anything(),
    );
    expect(mockedPdf.renderUpoPdf).not.toHaveBeenCalled();
  });

  it('surfaces an unknown template name for UPO input instead of ignoring the flag', async () => {
    mockedPdf.detectInvoiceVersion.mockReturnValue(null);
    mockedPdf.detectUpoVersion.mockReturnValue('UPO(4.3)');
    mockedPdf.renderInvoicePdf.mockRejectedValue(new Error('Unknown built-in template "bogus".'));
    await expect(runPdf({ file: 'upo.xml', template: 'bogus' })).rejects.toThrow(/Unknown built-in template/);
  });

  it('passes qr / ksefNumber / env through to the renderer', async () => {
    await runPdf({ file: 'invoice.xml', qr: true, ksefNumber: 'NR-1', env: 'test' });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'fa3-default',
      expect.objectContaining({ qr: true, ksefNumber: 'NR-1', env: 'test' }),
    );
  });

  it('renders bilingual labels with --locale pl+en', async () => {
    await runPdf({ file: 'invoice.xml', locale: 'pl+en' });
    expect(mockedPdf.renderInvoicePdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'fa3-default',
      expect.objectContaining({ locale: 'pl+en' }),
    );
  });

  it('surfaces the friendly pdfmake-missing error from the module', async () => {
    mockedPdf.renderInvoicePdf.mockRejectedValue(
      new Error('PDF rendering requires the optional peer dependency "pdfmake". Install it with: npm i "pdfmake@^0.2.20"'),
    );
    await expect(runPdf({ file: 'invoice.xml' })).rejects.toThrow(/npm i "pdfmake\^?0?\.?2?\.?20?"|pdfmake@\^0\.2\.20/);
  });

  it('emits JSON output when --json is set', async () => {
    await runPdf({ file: 'invoice.xml', json: true });
    expect(mockedOutput.outputResult).toHaveBeenCalledWith(
      expect.objectContaining({ out: 'invoice.pdf', bytes: FAKE_PDF.length }),
      { json: true },
    );
  });
});
