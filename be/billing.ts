import { prisma } from "./db";

export const PLAN_RUN_LIMITS = {
  BASIC: 20,
  PRO: 100,
} as const;

export type PlanUsage = {
  active: boolean;
  plan: "basic" | "pro" | null;
  limit: number;
  used: number;
  remaining: number;
  periodEnd: string | null;
};

export async function getPlanUsage(userId: string): Promise<PlanUsage> {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      currentPeriodEnd: { gt: now },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });

  if (!subscription) {
    return { active: false, plan: null, limit: 0, used: 0, remaining: 0, periodEnd: null };
  }

  const plan = subscription.plan;
  const limit = PLAN_RUN_LIMITS[plan];
  const periodStart = subscription.currentPeriodStart ?? subscription.createdAt;
  const used = await prisma.agentRun.count({
    where: {
      startedAt: { gte: periodStart, lt: subscription.currentPeriodEnd! },
      session: {
        is: {
          installation: { is: { userId } },
        },
      },
    },
  });

  return {
    active: true,
    plan: plan.toLocaleLowerCase() as "basic" | "pro",
    limit,
    used,
    remaining: Math.max(0, limit - used),
    periodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function getUsageLimitError(userId: string): Promise<string | null> {
  const usage = await getPlanUsage(userId);
  if (!usage.active) return "Choose a plan to start using Quill.";
  if (usage.remaining <= 0) {
    return `You’ve used all ${usage.limit} agent runs in your ${usage.plan === "basic" ? "Basic" : "Pro"} plan period. Upgrade your plan or wait for the next billing period.`;
  }
  return null;
}
