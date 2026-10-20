import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "./db";
import { storage, type InstallationData } from "./storage";
import { saveSession, type Session } from "./sessions";
import { saveRepoConfig, type RepoConfig } from "./repo-config";
import type { SideChatMessage } from "./side-chat";

const DATA_DIR = join(import.meta.dir, "data");
const MIGRATION_ID = "import-json-backend-data-v1";

async function readLegacyJson<T>(filename: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, filename), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function migrateLegacyJsonData(): Promise<void> {
  if (await prisma.backendMigration.findUnique({ where: { id: MIGRATION_ID } }))
    return;

  const [
    publicIds,
    installations,
    events,
    configs,
    legacySessions,
    sideChats,
    terminals,
  ] = await Promise.all([
    readLegacyJson<Record<string, string>>("profile-ids.json", {}),
    readLegacyJson<InstallationData[]>("installations.json", []),
    readLegacyJson<
      Record<
        string,
        { setupAction?: string; installedAt?: string; updatedAt?: string }
      >
    >("installation-events.json", {}),
    readLegacyJson<Record<string, RepoConfig>>("repo-configs.json", {}),
    readLegacyJson<Record<string, Partial<Session>>>("sessions.json", {}),
    readLegacyJson<Record<string, SideChatMessage[]>>("side-chats.json", {}),
    readLegacyJson<Record<string, number>>("terminals.json", {}),
  ]);

  for (const [userId, publicId] of Object.entries(publicIds)) {
    await storage.setPublicUserId(userId, publicId);
  }
  for (const installation of installations) {
    if (installation.userId && installation.installation_id)
      await storage.upsert(installation);
  }
  for (const [installationId, event] of Object.entries(events)) {
    const installedAt = event.installedAt
      ? new Date(event.installedAt)
      : new Date();
    const updatedAt = event.updatedAt ? new Date(event.updatedAt) : installedAt;
    await prisma.gitHubInstallationEvent.upsert({
      where: { installationId },
      create: {
        installationId,
        setupAction: event.setupAction,
        installedAt,
        updatedAt,
      },
      update: { setupAction: event.setupAction, installedAt, updatedAt },
    });
  }
  for (const [key, config] of Object.entries(configs)) {
    const separator = key.indexOf(":");
    if (separator < 1) continue;
    await saveRepoConfig(
      key.slice(0, separator),
      key.slice(separator + 1),
      config,
    );
  }
  for (const [id, partial] of Object.entries(legacySessions)) {
    if (!partial.installationId || !partial.sandboxId || !partial.repoFullName)
      continue;
    const session = {
      ...partial,
      id: partial.id || id,
      repoPath: partial.repoPath || "/home/user/repo",
      messages: partial.messages || [],
      logs: partial.logs || [],
      previewStarted: partial.previewStarted ?? false,
    } as Session;
    await saveSession(session);
  }
  for (const [sessionId, messages] of Object.entries(sideChats)) {
    if (
      !(await prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      }))
    )
      continue;
    for (const [sequence, message] of messages.entries()) {
      await prisma.sideChatMessage.upsert({
        where: { sessionId_sequence: { sessionId, sequence } },
        create: {
          sessionId,
          sequence,
          role: message.role === "user" ? "USER" : "ASSISTANT",
          content: message.content,
          time: new Date(message.time),
        },
        update: {
          role: message.role === "user" ? "USER" : "ASSISTANT",
          content: message.content,
          time: new Date(message.time),
        },
      });
    }
  }
  for (const [sessionId, pid] of Object.entries(terminals)) {
    if (
      !(await prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true },
      }))
    )
      continue;
    await prisma.terminalSession.upsert({
      where: { sessionId },
      create: { sessionId, pid },
      update: { pid },
    });
  }

  await prisma.backendMigration.create({ data: { id: MIGRATION_ID } });
  console.info("Imported existing Quill JSON data into PostgreSQL.");
}
