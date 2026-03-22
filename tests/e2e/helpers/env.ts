import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function getTestNip(): string {
  return getRequiredEnv('KSEF_TEST_NIP');
}

export function getTestToken(): string {
  return getRequiredEnv('KSEF_TEST_TOKEN');
}


export function hasTokenAuth(): boolean {
  return !!(process.env.KSEF_TEST_TOKEN && process.env.KSEF_TEST_NIP);
}
