import { prisma } from "./db";

export interface RepoConfig {
  buildCommand?: string;
  testCommand?: string;
  runCommand?: string;
  installCommand?: string;
  port?: number;
  hasUI?: boolean;
}

export function makeKey(installationId: string, repoFullName: string): string {
  return `${installationId}:${repoFullName}`;
}

export async function getRepoConfig(
  installationId: string,
  repoFullName: string,
): Promise<RepoConfig | null> {
  const row = await prisma.repositoryConfig.findUnique({
    where: { installationId_repoFullName: { installationId, repoFullName } },
  });
  if (!row) return null;
  return {
    buildCommand: row.buildCommand ?? undefined,
    testCommand: row.testCommand ?? undefined,
    runCommand: row.runCommand ?? undefined,
    installCommand: row.installCommand ?? undefined,
    port: row.port ?? undefined,
    hasUI: row.hasUI,
  };
}

export async function saveRepoConfig(
  installationId: string,
  repoFullName: string,
  config: RepoConfig,
): Promise<RepoConfig> {
  const row = await prisma.repositoryConfig.upsert({
    where: { installationId_repoFullName: { installationId, repoFullName } },
    create: {
      installationId,
      repoFullName,
      installCommand: config.installCommand,
      buildCommand: config.buildCommand,
      testCommand: config.testCommand,
      runCommand: config.runCommand,
      port: config.port,
      hasUI: config.hasUI ?? true,
    },
    update: {
      ...(config.installCommand !== undefined ? { installCommand: config.installCommand } : {}),
      ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
      ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
      ...(config.runCommand !== undefined ? { runCommand: config.runCommand } : {}),
      ...(config.port !== undefined ? { port: config.port } : {}),
      ...(config.hasUI !== undefined ? { hasUI: config.hasUI } : {}),
    },
  });
  return {
    buildCommand: row.buildCommand ?? undefined,
    testCommand: row.testCommand ?? undefined,
    runCommand: row.runCommand ?? undefined,
    installCommand: row.installCommand ?? undefined,
    port: row.port ?? undefined,
    hasUI: row.hasUI,
  };
}
