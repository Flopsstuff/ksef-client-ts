/**
 * Query invoices from KSeF.
 * Uses KSEF_TOKEN env var or ~/.ksef/session.json for auth.
 * Usage: npx tsx scripts/query-invoices.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { KSeFClient } from '../src/client.js';

const sessionPath = path.join(os.homedir(), '.ksef', 'session.json');

function loadJson(p: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

const envMap: Record<string, string> = { test: 'TEST', demo: 'DEMO', prod: 'PRD' };

async function main() {
  // Resolve access token: session.json JWT takes priority, env KSEF_TOKEN as fallback
  const session = loadJson(sessionPath);
  const accessToken = (session?.accessToken as string | undefined) ?? process.env.KSEF_TOKEN;
  if (!accessToken) {
    console.error('No token. Set KSEF_TOKEN env var or create ~/.ksef/session.json');
    process.exit(1);
  }

  const envKey = envMap[session?.environment as string ?? 'test'] ?? 'PRD';
  console.log(`Using environment: ${envKey}`);
  console.log(`Access token: ${accessToken.slice(0, 20)}...`);
  console.log();

  const client = new KSeFClient({ environment: envKey as 'TEST' | 'DEMO' | 'PRD' });

  // Query invoices for the last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dateFrom = thirtyDaysAgo.toISOString().split('T')[0] + 'T00:00:00+00:00';
  const dateTo = now.toISOString().split('T')[0] + 'T23:59:59+00:00';

  console.log(`Querying invoices from ${dateFrom} to ${dateTo}...`);
  console.log();

  try {
    // Subject1 = seller (invoices issued by us)
    const issued = await client.invoices.queryInvoiceMetadata(
      {
        subjectType: 'Subject1',
        dateRange: { dateType: 'PermanentStorage', from: dateFrom, to: dateTo },
      },
      accessToken,
      0,
      10,
    );
    console.log(`=== Issued invoices (Subject1) ===`);
    console.log(`Found: ${issued.invoices.length}, hasMore: ${issued.hasMore}`);
    for (const inv of issued.invoices) {
      console.log(`  ${inv.ksefNumber} | ${inv.invoiceNumber} | net=${inv.netAmount} gross=${inv.grossAmount} ${inv.currency} | ${inv.invoicingDate}`);
    }

    console.log();

    // Subject2 = buyer (invoices received by us)
    const received = await client.invoices.queryInvoiceMetadata(
      {
        subjectType: 'Subject2',
        dateRange: { dateType: 'PermanentStorage', from: dateFrom, to: dateTo },
      },
      accessToken,
      0,
      10,
    );
    console.log(`=== Received invoices (Subject2) ===`);
    console.log(`Found: ${received.invoices.length}, hasMore: ${received.hasMore}`);
    for (const inv of received.invoices) {
      console.log(`  ${inv.ksefNumber} | ${inv.invoiceNumber} | net=${inv.netAmount} gross=${inv.grossAmount} ${inv.currency} | seller: ${inv.seller.nip}`);
    }
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number; errorResponse?: unknown };
    console.error('Query failed:', error.message);
    if (error.statusCode) console.error('HTTP status:', error.statusCode);
    if (error.errorResponse) console.error('Response:', JSON.stringify(error.errorResponse, null, 2));
  }
}

main();
