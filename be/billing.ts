import { prisma } from "./db";

export const PLAN_RUN_LIMITS = {
  FREE: 5,
  BASIC: 50,
  PRO: 100,
} as const;

// Start the free allowance at rollout so earlier beta/testing activity does
// not consume an existing user's chance to try the free tier.
const FREE_TRIAL_START = new Date("2026-10-27T00:00:00.000Z");

export type PlanUsage = {
  active: boolean;
  plan: "free" | "basic" | "pro" | null;
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
    const limit = PLAN_RUN_LIMITS.FREE;
    const used = await prisma.agentRun.count({
      where: {
        startedAt: { gte: FREE_TRIAL_START },
        session: {
          is: {
            installation: { is: { userId } },
          },
        },
      },
    });
    return {
      active: true,
      plan: "free",
      limit,
      used,
      remaining: Math.max(0, limit - used),
      periodEnd: null,
    };
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
    if (usage.plan === "free") {
      return `You’ve used all ${usage.limit} free agent runs. Choose Basic or Pro to keep working with Quill.`;
    }
    return `You’ve used all ${usage.limit} agent runs in your ${usage.plan === "basic" ? "Basic" : "Pro"} plan period. Upgrade your plan or wait for the next billing period.`;
  }
  return null;
}
