import { prisma } from "./db";

export const PLAN_RUN_LIMITS = {
  FREE: 5,
  BASIC: 50,
  PRO: 100,
} as const;

// Each session starts at one credit. Every two follow-ups add one more credit.
export const FOLLOW_UPS_PER_EXTRA_CREDIT = 2;

export function sessionCreditsForUsage(requestCount: number): number {
  const followUps = Math.max(0, requestCount - 1);
  return 1 + Math.floor(followUps / FOLLOW_UPS_PER_EXTRA_CREDIT);
}

export function nextFollowUpConsumesCredit(requestCount: number): boolean {
  return requestCount > 0 && requestCount % FOLLOW_UPS_PER_EXTRA_CREDIT === 0;
}

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
    const sessions = await prisma.session.findMany({
      where: {
        createdAt: { gte: FREE_TRIAL_START },
        installation: {
          is: { userId },
        },
      },
      select: {
        messages: { where: { role: "user" }, select: { id: true } },
        queuedMessages: { where: { consumedAt: null }, select: { id: true } },
      },
    });
    const used = sessions.reduce(
      (total: number, session: { messages: { id: string }[]; queuedMessages: { id: string }[] }) =>
        total + sessionCreditsForUsage(session.messages.length + session.queuedMessages.length),
      0,
    );
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
  const sessions = await prisma.session.findMany({
    where: {
      createdAt: { gte: periodStart, lt: subscription.currentPeriodEnd! },
      installation: {
        is: { userId },
      },
    },
    select: {
      messages: { where: { role: "user" }, select: { id: true } },
      queuedMessages: { where: { consumedAt: null }, select: { id: true } },
    },
  });
  const used = sessions.reduce(
    (total: number, session: { messages: { id: string }[]; queuedMessages: { id: string }[] }) =>
      total + sessionCreditsForUsage(session.messages.length + session.queuedMessages.length),
    0,
  );

  return {
    active: true,
    plan: plan.toLocaleLowerCase() as "basic" | "pro",
    limit,
    used,
    remaining: Math.max(0, limit - used),
    periodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function getUsageLimitError(userId: string, requiredCredits = 1): Promise<string | null> {
  const usage = await getPlanUsage(userId);
  if (!usage.active) return "Choose a plan to start using Quill.";
  if (usage.remaining + Number.EPSILON >= requiredCredits) return null;
  if (usage.remaining > 0) {
    return `You have ${usage.remaining} credits remaining, but this action requires ${requiredCredits}. Choose a plan with more credits to continue.`;
  }
  if (usage.remaining <= 0) {
    if (usage.plan === "free") {
      return `You’ve used all ${usage.limit} free credits. Choose Basic or Pro and complete checkout manually to add credits.`;
    }
    return `You’ve used all ${usage.limit} credits in your ${usage.plan === "basic" ? "Basic" : "Pro"} plan period. Choose a plan and complete checkout manually to add credits.`;
  }
  return null;
}
