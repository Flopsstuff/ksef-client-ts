import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { KSeFClient } from '../src/client.js';

const session = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.ksef/session.json'), 'utf-8'));
const client = new KSeFClient({ environment: 'PRD' });

const result = await client.invoices.queryInvoiceMetadata(
  {
    subjectType: 'Subject2',
    dateRange: { dateType: 'PermanentStorage', from: '2026-02-01T00:00:00+00:00', to: '2026-03-08T23:59:59+00:00' },
  },
  session.accessToken,
);

console.log('Invoices found:', result.invoices.length);
for (const inv of result.invoices) {
  console.log(`  ${inv.ksefNumber} | ${inv.invoiceNumber} | net=${inv.netAmount} gross=${inv.grossAmount} vat=${inv.vatAmount} ${inv.currency}`);
  console.log(`    seller: ${inv.seller.nip} (${inv.seller.name})`);
  console.log(`    buyer: ${inv.buyer.identifier.type}=${inv.buyer.identifier.value} (${inv.buyer.name})`);
  console.log(`    type: ${inv.invoiceType} | mode: ${inv.invoicingMode} | form: ${inv.formCode.value} (${inv.formCode.systemCode})`);
}
