import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const PENDING_CHALLENGE_FILE = path.join(os.homedir(), '.ksef', 'pending-challenge.json');

export interface PendingChallenge {
  challenge: string;
  timestamp: string;
  contextIdentifier: { type: string; value: string };
  createdAt: string;
}

export function savePendingChallenge(data: PendingChallenge): void {
  const dir = path.dirname(PENDING_CHALLENGE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PENDING_CHALLENGE_FILE, JSON.stringify(data, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function clearPendingChallenge(): void {
  try { fs.unlinkSync(PENDING_CHALLENGE_FILE); } catch { /* ignore */ }
}
