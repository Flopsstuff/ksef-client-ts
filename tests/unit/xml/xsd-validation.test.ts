import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseXml, serializeInvoiceXml } from '../../../src/xml/index.js';
import {
  FA_XSD_PATHS,
  libxmljsAvailable,
  validateAgainstXsd,
} from './xsd-validator.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(currentDir, '..', '..', 'fixtures', 'xml');

function loadTemplateXml(fileName: string): string {
  const raw = fs.readFileSync(path.join(fixturesDir, fileName), 'utf8');
  // Substitute the upstream placeholders so the template is XSD-valid.
  return raw.replace(/#nip#/g, '1111111111').replace(/#invoice_number#/g, '0001');
}

describe.skipIf(!libxmljsAvailable)('Invoice XML XSD harness', () => {
  it('canonical FA2 template round-trips through the serializer and passes FA2 XSD', () => {
    const templateXml = loadTemplateXml('invoice-template-fa-2.xml');

    // Sanity check: template itself is XSD-valid before we touch it.
    const baseline = validateAgainstXsd(templateXml, FA_XSD_PATHS.FA2);
    expect(baseline.errors).toEqual([]);
    expect(baseline.valid).toBe(true);

    // Round-trip: parse the canonical XML into the engine's preserveOrder
    // array form, then re-serialize via the public entry point.
    const parsed = parseXml(templateXml);
    const rebuilt = serializeInvoiceXml(parsed).toString('utf8');

    const result = validateAgainstXsd(rebuilt, FA_XSD_PATHS.FA2);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('canonical FA3 template round-trips through the serializer and passes FA3 XSD', () => {
    const templateXml = loadTemplateXml('invoice-template-fa-3.xml');

    const baseline = validateAgainstXsd(templateXml, FA_XSD_PATHS.FA3);
    expect(baseline.errors).toEqual([]);
    expect(baseline.valid).toBe(true);

    const parsed = parseXml(templateXml);
    const rebuilt = serializeInvoiceXml(parsed).toString('utf8');

    const result = validateAgainstXsd(rebuilt, FA_XSD_PATHS.FA3);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
