import fs from 'fs/promises';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'installation-events.json');

type InstallationRecord = {
    installationId: string;
    setupAction?: string; // 'install' | 'update'
    installedAt: string;
    updatedAt: string;
};

async function readAll(): Promise<Record<string, InstallationRecord>> {
    try {
        return JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch {
        return {}; // file missing or empty on first run
    }
}

export async function saveInstallation(installationId: string, setupAction?: string) {
    const all = await readAll();
    const now = new Date().toISOString();
    all[installationId] = {
        installationId,
        setupAction,
        installedAt: all[installationId]?.installedAt ?? now,
        updatedAt: now,
    };
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
    }

    export async function isKnownInstallation(installationId: string) {
    return Boolean((await readAll())[installationId]);
}