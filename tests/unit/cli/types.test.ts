import { describe, it, expect } from 'vitest';
import { toEnvironmentName, DEFAULT_CONFIG, CLI_ENV_CHOICES } from '../../../src/cli/types.js';

describe('toEnvironmentName', () => {
  it('maps "test" to "TEST"', () => {
    expect(toEnvironmentName('test')).toBe('TEST');
  });

  it('maps "demo" to "DEMO"', () => {
    expect(toEnvironmentName('demo')).toBe('DEMO');
  });

  it('maps "prod" to "PRD"', () => {
    expect(toEnvironmentName('prod')).toBe('PRD');
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG).toEqual({
      environment: 'test',
      output: 'pretty',
      timeout: 30_000,
    });
  });
});

describe('CLI_ENV_CHOICES', () => {
  it('contains test, demo, prod', () => {
    expect(CLI_ENV_CHOICES).toEqual(['test', 'demo', 'prod']);
  });
});
