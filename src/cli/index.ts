import { defineCommand, runMain } from 'citty';
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
import { doctorCommand } from './commands/doctor.js';
import { completionCommand } from './commands/completion.js';

const main = defineCommand({
  meta: {
    name: 'ksef',
    version: '0.1.0',
    description: 'CLI for the Polish National e-Invoice System (KSeF)',
  },
  subCommands: {
    config: configCommand,
    auth: authCommand,
    session: sessionCommand,
    invoice: invoiceCommand,
    permission: permissionCommand,
    token: tokenCommand,
    cert: certCommand,
    qr: qrCommand,
    lighthouse: lighthouseCommand,
    'test-data': testDataCommand,
    doctor: doctorCommand,
    completion: completionCommand,
  },
});

runMain(main);
