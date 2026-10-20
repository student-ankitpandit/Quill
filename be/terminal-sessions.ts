import { prisma } from "./db";

export async function getTerminalPid(sessionId: string): Promise<number | undefined> {
  return (await prisma.terminalSession.findUnique({ where: { sessionId }, select: { pid: true } }))?.pid;
}

export async function setTerminalPid(sessionId: string, pid?: number): Promise<void> {
  if (pid === undefined) {
    await prisma.terminalSession.deleteMany({ where: { sessionId } });
    return;
  }
  await prisma.terminalSession.upsert({
    where: { sessionId },
    create: { sessionId, pid },
    update: { pid },
  });
}
