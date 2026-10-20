import { prisma } from "./db";
import { redactSensitiveText } from "./sessions";

export async function startAgentRun(
  sessionId: string,
  provider: string,
  model: string,
) {
  return prisma.agentRun.create({ data: { sessionId, provider, model } });
}

export async function completeAgentRun(
  id: string,
  response: {
    id?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
  },
) {
  await prisma.agentRun.update({
    where: { id },
    data: {
      status: "SUCCEEDED",
      requestId: response.id,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      finishedAt: new Date(),
    },
  });
}

export async function failAgentRun(id: string, error: unknown) {
  const wasCancelled = error instanceof Error && error.name === "AbortError";
  const message = redactSensitiveText(
    error instanceof Error ? error.message : String(error),
  ).slice(0, 2000);
  await prisma.agentRun.update({
    where: { id },
    data: {
      status: wasCancelled ? "CANCELLED" : "FAILED",
      failure: message,
      finishedAt: new Date(),
    },
  });
}
