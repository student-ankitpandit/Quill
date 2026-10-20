import fs from 'node:fs/promises';
import path from 'node:path';

const TERMINAL_FILE = path.join(import.meta.dir, 'data', 'terminals.json');

async function readTerminals(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(TERMINAL_FILE, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function getTerminalPid(sessionId: string): Promise<number | undefined> {
  return (await readTerminals())[sessionId];
}

export async function setTerminalPid(sessionId: string, pid?: number): Promise<void> {
  const terminals = await readTerminals();
  if (pid === undefined) delete terminals[sessionId];
  else terminals[sessionId] = pid;
  await fs.mkdir(path.dirname(TERMINAL_FILE), { recursive: true });
  await fs.writeFile(TERMINAL_FILE, JSON.stringify(terminals, null, 2));
}
