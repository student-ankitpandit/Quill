import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export type InstallationData = {
    userId: string;
    installation_id: string;
    githubUserId: string;
    refreshToken: string | null;
    email?: string | null;
    emailLookupAt?: number;
    name?: string;
    login?: string;
    createdAt: number;
    updatedAt: number;
};

const storageFile = join(import.meta.dir, "data", "installations.json");
const profileIdsFile = join(import.meta.dir, "data", "profile-ids.json");

const readInstallations = async (): Promise<InstallationData[]> => {
    try {
        const contents = await readFile(storageFile, "utf8");
        const parsed = JSON.parse(contents) as unknown;
        return Array.isArray(parsed) ? (parsed as InstallationData[]) : [];
    } catch (error: unknown) {
        if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
        ) {
        return [];
        }

        throw error;
    }
};

const writeInstallations = async (
  installations: InstallationData[],
): Promise<void> => {
  await mkdir(dirname(storageFile), { recursive: true });

  const temporaryFile = `${storageFile}.tmp`;
  await writeFile(
    temporaryFile,
    JSON.stringify(installations, null, 2),
    "utf8",
  );
  await rename(temporaryFile, storageFile);
};

export const storage = {
  async getOrCreatePublicUserId(userId: string): Promise<string> {
    let profiles: Record<string, string>;
    try {
      profiles = JSON.parse(await readFile(profileIdsFile, "utf8")) as Record<string, string>;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") profiles = {};
      else throw error;
    }
    if (profiles[userId]) return profiles[userId];

    const publicUserId = `user-${randomBytes(12).toString("hex")}`;
    profiles[userId] = publicUserId;
    await mkdir(dirname(profileIdsFile), { recursive: true });
    const temporaryFile = `${profileIdsFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(profiles, null, 2), "utf8");
    await rename(temporaryFile, profileIdsFile);
    return publicUserId;
  },

  async upsert(installation: InstallationData): Promise<void> {
    const installations = await readInstallations();
    const existingIndex = installations.findIndex(
      (item) => item.installation_id === installation.installation_id,
    );

    if (existingIndex === -1) {
      installations.push(installation);
    } else {
      installations[existingIndex] = installation;
    }

    await writeInstallations(installations);
  },

  async findByUserId(userId: string): Promise<InstallationData | null> {
    if (!userId) return null;
    const installations = await readInstallations();
    const matches = installations.filter(
      (item) =>
        item.userId === userId ||
        (item.githubUserId && `github${item.githubUserId}` === userId),
    );
    matches.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return matches[0] ?? null;
  },

  async setInstallationForUser(
    userId: string,
    installationId: string,
    extras: Partial<InstallationData> = {},
  ): Promise<void> {
    const installations = await readInstallations();
    const now = Date.now();
    const existingIndex = installations.findIndex((item) => item.userId === userId);
    const githubUserId =
      extras.githubUserId ??
      installations[existingIndex]?.githubUserId ??
      userId.replace(/^github/, "");

    if (existingIndex === -1) {
      installations.push({
        userId,
        installation_id: installationId,
        githubUserId,
        refreshToken: extras.refreshToken ?? null,
        email: extras.email,
        emailLookupAt: extras.emailLookupAt,
        name: extras.name,
        login: extras.login,
        createdAt: extras.createdAt ?? now,
        updatedAt: now,
      });
    } else {
      const existing = installations[existingIndex];
      installations[existingIndex] = {
        ...(existing ?? {}),
        ...extras,
        userId,
        installation_id: installationId,
        githubUserId,
        refreshToken: extras.refreshToken ?? existing?.refreshToken ?? null,
        createdAt: extras.createdAt ?? existing?.createdAt ?? now,
        updatedAt: now,
      };
    }

    await writeInstallations(installations);
  },
};


