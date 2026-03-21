import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completionCommand } from '../../../../src/cli/commands/completion.js';

const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(() => {
  logSpy.mockClear();
});

const TOP_COMMANDS = [
  'config', 'auth', 'session', 'invoice', 'permission', 'token',
  'cert', 'qr', 'lighthouse', 'test-data', 'doctor', 'completion',
];

async function runSub(name: string): Promise<string> {
  // citty commands accessed via subCommands
  const sub = completionCommand.subCommands![name as keyof typeof completionCommand.subCommands];
  await (sub as any).run!({ args: {} });
  return logSpy.mock.calls[0]![0] as string;
}

describe('completion', () => {
  describe('bash', () => {
    it('contains _ksef_completions and complete -F', async () => {
      const output = await runSub('bash');
      expect(output).toContain('_ksef_completions');
      expect(output).toContain('complete -F');
    });

    it('includes case branches for commands with subcommands', async () => {
      const output = await runSub('bash');
      expect(output).toContain('config)');
      expect(output).toContain('auth)');
    });
  });

  describe('zsh', () => {
    it('contains #compdef ksef and _describe', async () => {
      const output = await runSub('zsh');
      expect(output).toContain('#compdef ksef');
      expect(output).toContain('_describe');
    });
  });

  describe('fish', () => {
    it('contains __fish_use_subcommand for top-level commands', async () => {
      const output = await runSub('fish');
      expect(output).toContain('__fish_use_subcommand');
    });

    it('contains __fish_seen_subcommand_from for subcommands', async () => {
      const output = await runSub('fish');
      expect(output).toContain('__fish_seen_subcommand_from config');
      expect(output).toContain('__fish_seen_subcommand_from auth');
    });
  });

  describe('all formats', () => {
    it('all top-level commands present in each format', async () => {
      for (const format of ['bash', 'zsh', 'fish']) {
        logSpy.mockClear();
        const output = await runSub(format);
        for (const cmd of TOP_COMMANDS) {
          expect(output, `${format} missing "${cmd}"`).toContain(cmd);
        }
      }
    });
  });
});
