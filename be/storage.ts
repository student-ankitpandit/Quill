import { randomBytes } from "node:crypto";
import { prisma } from "./db";

export type InstallationData = {
  userId: string;
  installation_id: string;
  githubUserId: string;
  refreshToken: string | null;
  email?: string | null;
  emailLookupAt?: number | null;
  name?: string;
  login?: string;
  createdAt: number;
  updatedAt: number;
};

function githubId(userId: string, explicit?: string | number): string {
  return String(explicit ?? userId.replace(/^github/, ""));
}

async function ensureUser(
  userId: string,
  extras: Partial<InstallationData> = {},
  publicId?: string,
) {
  const githubUserId = githubId(userId, extras.githubUserId);
  return prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      githubUserId,
      publicId: publicId ?? `user-${randomBytes(12).toString("hex")}`,
      login: extras.login,
      name: extras.name,
      email: extras.email,
    },
    update: {
      githubUserId,
      ...(extras.login !== undefined ? { login: extras.login } : {}),
      ...(extras.name !== undefined ? { name: extras.name } : {}),
      ...(extras.email !== undefined ? { email: extras.email } : {}),
    },
  });
}

function toInstallationData(
  user: { id: string; githubUserId: string; name: string | null; login: string | null; email: string | null },
  installation: { installationId: string; refreshToken: string | null; createdAt: Date; updatedAt: Date; emailLookupAt: Date | null },
): InstallationData {
  return {
    userId: user.id,
    githubUserId: user.githubUserId,
    installation_id: installation.installationId,
    refreshToken: installation.refreshToken,
    email: user.email,
    emailLookupAt: installation.emailLookupAt?.getTime(),
    name: user.name ?? undefined,
    login: user.login ?? undefined,
    createdAt: installation.createdAt.getTime(),
    updatedAt: installation.updatedAt.getTime(),
  };
}

export const storage = {
  async getOrCreatePublicUserId(userId: string): Promise<string> {
    const user = await ensureUser(userId);
    return user.publicId;
  },

  async updateProfile(
    userId: string,
    profile: { login?: string; name?: string; email?: string | null },
  ): Promise<void> {
    await ensureUser(userId, profile);
  },

  async upsert(installation: InstallationData): Promise<void> {
    await this.setInstallationForUser(installation.userId, installation.installation_id, installation);
  },

  async findByUserId(userId: string): Promise<InstallationData | null> {
    if (!userId) return null;
    const githubUserId = githubId(userId);
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { githubUserId }] },
      include: { installations: { orderBy: { updatedAt: "desc" }, take: 1 } },
    });
    const installation = user?.installations[0];
    return user && installation ? toInstallationData(user, installation) : null;
  },

  async setInstallationForUser(
    userId: string,
    installationId: string,
    extras: Partial<InstallationData> = {},
  ): Promise<void> {
    const existing = await prisma.gitHubInstallation.findUnique({ where: { installationId } });
    if (existing && existing.userId !== userId) {
      throw new Error(
        "This GitHub App installation is already linked to another Quill account. Sign in with the GitHub account that owns the installation, or install Quill under your own account.",
      );
    }

    const user = await ensureUser(userId, {
      ...extras,
      githubUserId: githubId(userId, extras.githubUserId),
    });
    const emailLookupAt = extras.emailLookupAt === undefined
      ? undefined
      : extras.emailLookupAt === null
        ? null
        : new Date(extras.emailLookupAt);

    await prisma.gitHubInstallation.upsert({
      where: { installationId },
      create: {
        installationId,
        userId: user.id,
        refreshToken: extras.refreshToken ?? existing?.refreshToken ?? null,
        emailLookupAt: emailLookupAt ?? null,
        createdAt: extras.createdAt ? new Date(extras.createdAt) : undefined,
      },
      update: {
        userId: user.id,
        ...(extras.refreshToken !== undefined ? { refreshToken: extras.refreshToken } : {}),
        ...(emailLookupAt !== undefined ? { emailLookupAt } : {}),
      },
    });
  },

  async setPublicUserId(userId: string, publicId: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) {
      await prisma.user.update({ where: { id: userId }, data: { publicId } });
      return;
    }
    await ensureUser(userId, {}, publicId);
  },
};
