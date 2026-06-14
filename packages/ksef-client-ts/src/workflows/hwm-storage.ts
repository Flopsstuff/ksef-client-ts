import * as fs from 'node:fs/promises';
import type { ContinuationPoints } from './hwm-coordinator.js';

export interface HwmStore {
  load(): Promise<ContinuationPoints>;
  save(points: ContinuationPoints): Promise<void>;
}

export class InMemoryHwmStore implements HwmStore {
  private points: ContinuationPoints = {};

  async load(): Promise<ContinuationPoints> {
    return { ...this.points };
  }

  async save(points: ContinuationPoints): Promise<void> {
    this.points = { ...points };
  }
}

export class FileHwmStore implements HwmStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<ContinuationPoints> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data) as ContinuationPoints;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw err;
    }
  }

  async save(points: ContinuationPoints): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(points, null, 2), 'utf-8');
  }
}
