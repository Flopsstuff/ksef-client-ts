import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineCommand, runMain } from 'citty';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };
const version = pkg.version;
import { configCommand } from './commands/config.js';
import { authCommand } from './commands/auth.js';
import { sessionCommand } from './commands/session.js';
import { invoiceCommand } from './commands/invoice.js';
import { permissionCommand } from './commands/permission.js';
import { tokenCommand } from './commands/token.js';
import { certCommand } from './commands/cert.js';
import { qrCommand } from './commands/qr.js';
import { lighthouseCommand } from './commands/lighthouse.js';
import { testDataCommand } from './commands/test-data.js';
import { limitsCommand } from './commands/limits.js';
import { collectiveIdentifierCommand } from './commands/collective-identifier.js';
import { peppolCommand } from './commands/peppol.js';
import { doctorCommand } from './commands/doctor.js';
import { completionCommand } from './commands/completion.js';
import { setupCommand } from './commands/setup.js';
import { offlineCommand } from './commands/offline.js';

const main = defineCommand({
  meta: {
    name: 'ksef',
    version,
    description: 'CLI for the Polish National e-Invoice System (KSeF)',
  },
  subCommands: {
    setup: setupCommand,
    config: configCommand,
    auth: authCommand,
    session: sessionCommand,
    invoice: invoiceCommand,
    permission: permissionCommand,
    token: tokenCommand,
    cert: certCommand,
    qr: qrCommand,
    lighthouse: lighthouseCommand,
    limits: limitsCommand,
    'collective-identifier': collectiveIdentifierCommand,
    peppol: peppolCommand,
    'test-data': testDataCommand,
    offline: offlineCommand,
    doctor: doctorCommand,
    completion: completionCommand,
  },
});

runMain(main);
