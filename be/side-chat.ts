import { prisma } from "./db";

export type SideChatMessage = {
  role: "user" | "assistant";
  content: string;
  time: string;
};

export async function getSideChat(sessionId: string): Promise<SideChatMessage[]> {
  const rows = await prisma.sideChatMessage.findMany({
    where: { sessionId },
    orderBy: { sequence: "asc" },
  });
  return rows.map((row) => ({
    role: row.role.toLowerCase() as SideChatMessage["role"],
    content: row.content,
    time: row.time.toISOString(),
  }));
}

export async function appendSideChat(
  sessionId: string,
  messages: SideChatMessage[],
): Promise<SideChatMessage[]> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.sideChatMessage.aggregate({
      where: { sessionId },
      _max: { sequence: true },
    });
    let sequence = (current._max.sequence ?? -1) + 1;
    for (const message of messages) {
      await tx.sideChatMessage.create({
        data: {
          sessionId,
          sequence: sequence++,
          role: message.role === "user" ? "USER" : "ASSISTANT",
          content: message.content,
          time: new Date(message.time),
        },
      });
    }
  });
  return getSideChat(sessionId);
}
