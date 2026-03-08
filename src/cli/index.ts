import { defineCommand, runMain } from 'citty';
import { configCommand } from './commands/config.js';
import { authCommand } from './commands/auth.js';
import { sessionCommand } from './commands/session.js';
import { invoiceCommand } from './commands/invoice.js';
import { permissionCommand } from './commands/permission.js';
import { tokenCommand } from './commands/token.js';

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
  },
});

runMain(main);
