import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryHwmStore, FileHwmStore } from '../../../src/workflows/hwm-storage.js';

describe('InMemoryHwmStore', () => {
  let store: InMemoryHwmStore;

  beforeEach(() => {
    store = new InMemoryHwmStore();
  });

  it('load() returns empty object initially', async () => {
    const result = await store.load();
    expect(result).toEqual({});
  });

  it('save() then load() returns saved data', async () => {
    const points = { Subject1: '2026-01-15T12:00:00Z', Subject2: '2026-02-20T08:30:00Z' };
    await store.save(points);
    const result = await store.load();
    expect(result).toEqual(points);
  });

  it('save() overwrites previous data', async () => {
    await store.save({ Subject1: '2026-01-15T12:00:00Z' });
    await store.save({ Subject2: '2026-03-01T00:00:00Z' });
    const result = await store.load();
    expect(result).toEqual({ Subject2: '2026-03-01T00:00:00Z' });
    expect(result).not.toHaveProperty('Subject1');
  });

  it('returned object from load() is a copy — mutations do not affect stored data', async () => {
    await store.save({ Subject1: '2026-01-15T12:00:00Z' });
    const loaded = await store.load();
    loaded['Subject1'] = 'MUTATED';
    loaded['NewKey'] = 'INJECTED';

    const reloaded = await store.load();
    expect(reloaded).toEqual({ Subject1: '2026-01-15T12:00:00Z' });
    expect(reloaded).not.toHaveProperty('NewKey');
  });

  it('save() copies input — later mutations to the input do not affect stored data', async () => {
    const points = { Subject1: '2026-01-15T12:00:00Z' };
    await store.save(points);
    points['Subject1'] = 'MUTATED';
    points['NewKey'] = 'INJECTED';

    const loaded = await store.load();
    expect(loaded).toEqual({ Subject1: '2026-01-15T12:00:00Z' });
    expect(loaded).not.toHaveProperty('NewKey');
  });
});

describe('FileHwmStore', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hwm-store-test-${randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    filePath = path.join(tmpDir, 'hwm.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('load() returns empty object when file does not exist', async () => {
    const store = new FileHwmStore(filePath);
    const result = await store.load();
    expect(result).toEqual({});
  });

  it('save() creates file, then load() reads it back', async () => {
    const store = new FileHwmStore(filePath);
    const points = { Subject1: '2026-01-15T12:00:00Z', Subject2: '2026-02-20T08:30:00Z' };
    await store.save(points);

    const result = await store.load();
    expect(result).toEqual(points);
  });

  it('save() overwrites existing file', async () => {
    const store = new FileHwmStore(filePath);
    await store.save({ Subject1: '2026-01-15T12:00:00Z' });
    await store.save({ Subject2: '2026-03-01T00:00:00Z' });

    const result = await store.load();
    expect(result).toEqual({ Subject2: '2026-03-01T00:00:00Z' });
    expect(result).not.toHaveProperty('Subject1');
  });

  it('saved file contains pretty-printed JSON', async () => {
    const store = new FileHwmStore(filePath);
    const points = { Subject1: '2026-01-15T12:00:00Z' };
    await store.save(points);

    const raw = await fs.readFile(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify(points, null, 2));
  });

  it('rethrows non-ENOENT errors on load()', async () => {
    // Create a directory at the file path — reading it will produce EISDIR, not ENOENT
    await fs.mkdir(filePath, { recursive: true });
    const store = new FileHwmStore(filePath);

    await expect(store.load()).rejects.toThrow();
  });
});
