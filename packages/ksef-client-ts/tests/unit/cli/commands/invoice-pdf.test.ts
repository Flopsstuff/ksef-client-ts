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
  renderInvoicePdfFromFile: vi.fn(),
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
  mockedPdf.renderInvoicePdfFromFile.mockResolvedValue(FAKE_PDF);
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
    await runPdf({ file: 'invoice.xml', templateFile: './custom.json' });
    expect(mockedPdf.renderInvoicePdfFromFile).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      './custom.json',
      expect.anything(),
    );
    expect(mockedPdf.renderInvoicePdf).not.toHaveBeenCalled();
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
