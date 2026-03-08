import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionData } from './types.js';

const SESSION_DIR = path.join(os.homedir(), '.ksef');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

export function loadSession(): SessionData | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionData): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function clearSession(): void {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    // ignore if file doesn't exist
  }
}

export function isSessionExpired(session: SessionData): boolean {
  if (!session.expiresAt) return false;
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export function saveOnlineSessionRef(ref: string): void {
  const session = loadSession();
  if (!session) {
    throw new Error('No active session. Run `ksef auth login` first.');
  }
  session.onlineSessionRef = ref;
  saveSession(session);
}

export function clearOnlineSessionRef(): void {
  const session = loadSession();
  if (session) {
    delete session.onlineSessionRef;
    saveSession(session);
  }
}
