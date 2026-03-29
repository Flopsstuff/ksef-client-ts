import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CREDENTIALS_DIR = path.join(os.homedir(), '.ksef');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

export interface CliCredentials {
  token?: string;
}

export function loadCredentials(): CliCredentials | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as CliCredentials;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) return null;
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export function saveCredentials(creds: CliCredentials): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(CREDENTIALS_FILE);
  } catch {
    // ignore if file doesn't exist
  }
}
