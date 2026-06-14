import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consola } from 'consola';
import {
  outputResult,
  outputTable,
  outputKeyValue,
  outputSuccess,
  outputWarning,
} from '../../../src/cli/output.js';

vi.mock('consola', () => ({
  consola: {
    log: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('outputResult', () => {
  it('outputs JSON to console.log when json=true', () => {
    const data = { foo: 'bar' };
    outputResult(data, { json: true });

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
  });

  it('outputs via consola.log when json=false', () => {
    const data = { foo: 'bar' };
    outputResult(data, {});

    expect(consola.log).toHaveBeenCalledWith(data);
  });
});

describe('outputTable', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'value', label: 'Value' },
  ];

  it('outputs JSON array when json=true', () => {
    const rows = [{ name: 'a', value: 1 }];
    outputTable(rows, columns, { json: true });

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(rows, null, 2));
  });

  it('renders a table when json=false', () => {
    const rows = [{ name: 'a', value: 1 }];
    outputTable(rows, columns, {});

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(output).toContain('Name');
    expect(output).toContain('Value');
  });

  it('handles empty rows without crashing', () => {
    expect(() => outputTable([], columns, {})).not.toThrow();
  });

  it('converts null/undefined values to empty string', () => {
    const rows = [{ name: null, value: undefined }];
    outputTable(rows as unknown as Record<string, unknown>[], columns, {});

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(output).toBeDefined();
  });
});

describe('outputKeyValue', () => {
  it('outputs JSON when json=true', () => {
    const entries = { key1: 'val1', key2: 42 };
    outputKeyValue(entries, { json: true });

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(entries, null, 2));
  });

  it('renders a key-value table when json=false', () => {
    const entries = { key1: 'val1' };
    outputKeyValue(entries, {});

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(output).toContain('key1');
    expect(output).toContain('val1');
  });
});

describe('outputSuccess', () => {
  it('calls consola.success', () => {
    outputSuccess('done!');
    expect(consola.success).toHaveBeenCalledWith('done!');
  });
});

describe('outputWarning', () => {
  it('calls consola.warn', () => {
    outputWarning('careful');
    expect(consola.warn).toHaveBeenCalledWith('careful');
  });
});
