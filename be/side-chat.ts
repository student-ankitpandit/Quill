import fs from 'node:fs/promises';
import path from 'node:path';

export type SideChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  time: string;
};

const CHAT_FILE = path.join(import.meta.dir, 'data', 'side-chats.json');

async function readChats(): Promise<Record<string, SideChatMessage[]>> {
  try {
    return JSON.parse(await fs.readFile(CHAT_FILE, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function getSideChat(sessionId: string): Promise<SideChatMessage[]> {
  return (await readChats())[sessionId] ?? [];
}

export async function appendSideChat(
  sessionId: string,
  messages: SideChatMessage[],
): Promise<SideChatMessage[]> {
  const chats = await readChats();
  chats[sessionId] = [...(chats[sessionId] ?? []), ...messages].slice(-200);
  await fs.mkdir(path.dirname(CHAT_FILE), { recursive: true });
  await fs.writeFile(CHAT_FILE, JSON.stringify(chats, null, 2));
  return chats[sessionId];
}
