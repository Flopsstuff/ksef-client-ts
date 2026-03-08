import type { EnvironmentName } from '../config/environments.js';

export type OutputFormat = 'pretty' | 'json';

export interface CliConfig {
  environment: 'test' | 'demo' | 'prod';
  nip?: string;
  output: OutputFormat;
  timeout: number;
}

export interface SessionData {
  accessToken: string;
  refreshToken?: string;
  sessionRef?: string;
  expiresAt?: string;
  environment: CliConfig['environment'];
}

export interface GlobalOptions {
  env?: string;
  json?: boolean;
  verbose?: boolean;
  noColor?: boolean;
  timeout?: string;
  nip?: string;
}

const ENV_MAP: Record<string, EnvironmentName> = {
  test: 'TEST',
  demo: 'DEMO',
  prod: 'PRD',
};

export function toEnvironmentName(env: CliConfig['environment']): EnvironmentName {
  return ENV_MAP[env]!;
}

export const CLI_ENV_CHOICES = ['test', 'demo', 'prod'] as const;

export const DEFAULT_CONFIG: CliConfig = {
  environment: 'test',
  output: 'pretty',
  timeout: 30_000,
};
