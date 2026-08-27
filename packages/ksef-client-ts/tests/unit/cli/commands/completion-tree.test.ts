import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { COMMAND_TREE } from '../../../../src/cli/commands/completion.js';
import { setupCommand } from '../../../../src/cli/commands/setup.js';
import { configCommand } from '../../../../src/cli/commands/config.js';
import { authCommand } from '../../../../src/cli/commands/auth.js';
import { sessionCommand } from '../../../../src/cli/commands/session.js';
import { invoiceCommand } from '../../../../src/cli/commands/invoice.js';
import { permissionCommand } from '../../../../src/cli/commands/permission.js';
import { tokenCommand } from '../../../../src/cli/commands/token.js';
import { certCommand } from '../../../../src/cli/commands/cert.js';
import { qrCommand } from '../../../../src/cli/commands/qr.js';
import { lighthouseCommand } from '../../../../src/cli/commands/lighthouse.js';
import { limitsCommand } from '../../../../src/cli/commands/limits.js';
import { collectiveIdentifierCommand } from '../../../../src/cli/commands/collective-identifier.js';
import { peppolCommand } from '../../../../src/cli/commands/peppol.js';
import { testDataCommand } from '../../../../src/cli/commands/test-data.js';
import { offlineCommand } from '../../../../src/cli/commands/offline.js';
import { doctorCommand } from '../../../../src/cli/commands/doctor.js';
import { completionCommand } from '../../../../src/cli/commands/completion.js';

// src/cli/index.ts calls runMain() at module scope, so it cannot be imported here.
// Read its registry as text instead — the point is to catch a group added there and
// nowhere else, which is how collective-identifier went missing from completions.
function groupsRegisteredInCli(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../../../../src/cli/index.ts'), 'utf-8');
  const block = /subCommands:\s*\{([\s\S]*?)\n\s*\},/.exec(source);
  if (!block) throw new Error('could not locate the subCommands block in src/cli/index.ts');
  return [...block[1].matchAll(/^\s*'?([a-z-]+)'?:/gm)].map((m) => m[1]);
}

const COMMANDS: Record<string, { subCommands?: Record<string, unknown> }> = {
  setup: setupCommand, config: configCommand, auth: authCommand, session: sessionCommand,
  invoice: invoiceCommand, permission: permissionCommand, token: tokenCommand, cert: certCommand,
  qr: qrCommand, lighthouse: lighthouseCommand, limits: limitsCommand,
  'collective-identifier': collectiveIdentifierCommand, peppol: peppolCommand,
  'test-data': testDataCommand, offline: offlineCommand, doctor: doctorCommand,
  completion: completionCommand,
};

describe('shell completion tree', () => {
  it('covers exactly the command groups the CLI registers, in the same order', () => {
    expect(Object.keys(COMMAND_TREE)).toEqual(groupsRegisteredInCli());
  });

  it.each(Object.keys(COMMANDS))('lists every subcommand of %s', (group) => {
    const actual = Object.keys(COMMANDS[group].subCommands ?? {});
    expect([...COMMAND_TREE[group]].sort()).toEqual([...actual].sort());
  });
});
