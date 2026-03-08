import { defineCommand, runMain } from 'citty';
import { configCommand } from './commands/config.js';
import { authCommand } from './commands/auth.js';

const main = defineCommand({
  meta: {
    name: 'ksef',
    version: '0.1.0',
    description: 'CLI for the Polish National e-Invoice System (KSeF)',
  },
  subCommands: {
    config: configCommand,
    auth: authCommand,
  },
});

runMain(main);
