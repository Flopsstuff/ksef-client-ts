import { defineCommand } from 'citty';
import { requireSession } from '../client-factory.js';
import { outputResult, outputKeyValue, outputTable } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

const context = defineCommand({
  meta: { name: 'context', description: 'View effective context limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      const result = await client.limits.getContextLimits();

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Online — Max Invoice Size (MB)': result.onlineSession.maxInvoiceSizeInMB,
          'Online — Max Invoice+Attachment Size (MB)': result.onlineSession.maxInvoiceWithAttachmentSizeInMB,
          'Online — Max Invoices': result.onlineSession.maxInvoices,
          'Batch — Max Invoice Size (MB)': result.batchSession.maxInvoiceSizeInMB,
          'Batch — Max Invoice+Attachment Size (MB)': result.batchSession.maxInvoiceWithAttachmentSizeInMB,
          'Batch — Max Invoices': result.batchSession.maxInvoices,
        }, { json: false });
      }
    });
  },
});

const subject = defineCommand({
  meta: { name: 'subject', description: 'View effective subject limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      const result = await client.limits.getSubjectLimits();

      if (args.json) {
        outputResult(result, { json: true });
      } else {
        outputKeyValue({
          'Max Enrollments': result.enrollment?.maxEnrollments ?? 'Unlimited',
          'Max Certificates': result.certificate?.maxCertificates ?? 'Unlimited',
        }, { json: false });
      }
    });
  },
});

const rate = defineCommand({
  meta: { name: 'rate', description: 'View effective API rate limits' },
  args: {
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = requireSession(globalOpts);

      const result = await client.limits.getRateLimits();

      if (args.json) {
        outputResult(result, { json: true });
        return;
      }

      const categories = Object.entries(result) as [string, { perSecond: number; perMinute: number; perHour: number }][];

      outputTable(
        categories.map(([category, values]) => ({
          category,
          perSecond: values.perSecond,
          perMinute: values.perMinute,
          perHour: values.perHour,
        })),
        [
          { key: 'category', label: 'Category' },
          { key: 'perSecond', label: 'Per Second' },
          { key: 'perMinute', label: 'Per Minute' },
          { key: 'perHour', label: 'Per Hour' },
        ],
        { json: false },
      );
    });
  },
});

export const limitsCommand = defineCommand({
  meta: { name: 'limits', description: 'View KSeF API limits' },
  subCommands: { context, subject, rate },
});
