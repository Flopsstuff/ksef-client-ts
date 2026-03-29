import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { requireSession } from '../client-factory.js';
import { outputResult, outputSuccess } from '../output.js';
import { withErrorHandler } from '../error-handler.js';
import type { GlobalOptions } from '../types.js';
import type { InvoiceSubjectType } from '../../models/invoices/types.js';
import { FileHwmStore } from '../../workflows/hwm-storage.js';
import { incrementalExportAndDownload } from '../../workflows/incremental-export-workflow.js';
import type { ContinuationPoints } from '../../workflows/hwm-coordinator.js';
import { normalizeCliDate } from '../date-utils.js';

function getGlobalOpts(args: Record<string, unknown>): GlobalOptions {
  return {
    env: args.env as string | undefined,
    json: args.json as boolean | undefined,
    verbose: args.verbose as boolean | undefined,
    timeout: args.timeout as string | undefined,
    nip: args.nip as string | undefined,
  };
}

export const exportIncremental = defineCommand({
  meta: { name: 'export-incremental', description: 'Incremental invoice export with HWM state persistence' },
  args: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD) — required', required: true },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    subjectType: { type: 'string', description: 'Subject type: Subject1|Subject2|Subject3|SubjectAuthorized (default: Subject1)' },
    stateFile: { type: 'string', description: 'HWM state file path (default: ./ksef-hwm-state.json)' },
    outputDir: { type: 'string', description: 'Output directory for exported parts (default: ./ksef-exports/)' },
    maxIterations: { type: 'string', description: 'Max export iterations (default: 20)' },
    env: { type: 'string', description: 'Environment (test/demo/prod)' },
    json: { type: 'boolean', description: 'Output as JSON' },
    verbose: { type: 'boolean', description: 'Show HTTP request/response details' },
    timeout: { type: 'string', description: 'Request timeout (ms)' },
    nip: { type: 'string', description: 'NIP number' },
  },
  run({ args }) {
    return withErrorHandler(async () => {
      const globalOpts = getGlobalOpts(args);
      const { client } = await requireSession(globalOpts);

      const from = normalizeCliDate(args.from as string, 'from');
      const to = normalizeCliDate((args.to as string | undefined) ?? new Date().toISOString().slice(0, 10), 'to');
      const subjectType = (args.subjectType as InvoiceSubjectType | undefined) ?? 'Subject1';
      const stateFile = (args.stateFile as string | undefined) ?? './ksef-hwm-state.json';
      const outputDir = (args.outputDir as string | undefined) ?? './ksef-exports';
      const maxIterations = args.maxIterations ? parseInt(args.maxIterations as string, 10) : 20;
      const isJson = args.json as boolean | undefined;

      const store = new FileHwmStore(stateFile);
      const continuationPoints: ContinuationPoints = {};

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (!isJson) {
        consola.start(`Incremental export: ${from} → ${to}, subject: ${subjectType}`);
        consola.info(`State file: ${stateFile}`);
        consola.info(`Output dir: ${outputDir}`);
      }

      // Track iteration→parts mapping for file naming after export
      const iterationParts: Array<{ iteration: number; partCount: number }> = [];

      const result = await incrementalExportAndDownload(client, {
        subjectType,
        windowFrom: from,
        windowTo: to,
        continuationPoints,
        maxIterations,
        store,
        pollOptions: { intervalMs: 2000 },
        onIterationComplete: (iteration, iterResult) => {
          iterationParts.push({ iteration, partCount: iterResult.parts.length });

          if (!isJson) {
            const hwmDate = continuationPoints[subjectType] ?? 'complete';
            consola.info(
              `Iteration ${iteration + 1}: ${iterResult.invoiceCount} invoices, ` +
              `truncated: ${iterResult.isTruncated}, HWM: ${hwmDate}`,
            );
          }
        },
      });

      // Save decrypted parts to files after export completes
      let partIndex = 0;
      for (const { iteration, partCount } of iterationParts) {
        for (let p = 0; p < partCount; p++) {
          if (partIndex < result.decryptedParts.length) {
            const fileName = `iter-${String(iteration + 1).padStart(3, '0')}-part-${String(p + 1).padStart(3, '0')}.zip`;
            const filePath = path.join(outputDir, fileName);
            fs.writeFileSync(filePath, result.decryptedParts[partIndex]!);
            partIndex++;
          }
        }
      }

      if (isJson) {
        outputResult({
          referenceNumbers: result.referenceNumbers,
          iterationCount: result.iterationCount,
          totalParts: result.decryptedParts.length,
          continuationPoints: result.continuationPoints,
          outputDir,
        }, { json: true });
      } else {
        outputSuccess(
          `Export complete: ${result.iterationCount} iterations, ` +
          `${result.decryptedParts.length} parts downloaded`,
        );
        consola.info(`Final HWM: ${continuationPoints[subjectType] ?? 'complete'}`);
        consola.info(`Output: ${outputDir}`);
      }
    });
  },
});
