import { prisma } from "./db";

export async function saveInstallation(installationId: string, setupAction?: string) {
  const previous = await prisma.gitHubInstallationEvent.findUnique({ where: { installationId } });
  const now = new Date();
  await prisma.gitHubInstallationEvent.upsert({
    where: { installationId },
    create: { installationId, setupAction, installedAt: now, updatedAt: now },
    update: { setupAction, updatedAt: now },
  });

  if (setupAction === "uninstall") {
    await prisma.gitHubInstallation.updateMany({
      where: { installationId },
      data: { uninstalledAt: now },
    });
  } else if (previous && setupAction) {
    await prisma.gitHubInstallation.updateMany({
      where: { installationId },
      data: { uninstalledAt: null },
    });
  }
}

export async function isKnownInstallation(installationId: string) {
  return Boolean(await prisma.gitHubInstallationEvent.findUnique({ where: { installationId } }));
}
