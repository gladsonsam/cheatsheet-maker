import type { CheatsheetFile, ToolbarSettings } from '../types';

export interface StorageInfo {
    dir: string;
}

const STORAGE_KEY = 'cheatsheet_files';

// In the Electron desktop shell the preload script exposes window.electronAPI.
// In the browser build it's undefined and we fall back to localStorage.
const desktopApi = () =>
    typeof window !== 'undefined' ? window.electronAPI : undefined;

const sortByUpdatedAt = (files: CheatsheetFile[]) => {
    return [...files].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

// Older web data stored numeric ids; normalize everything to strings so that
// identity comparisons stay consistent across desktop and web.
const normalize = (file: CheatsheetFile): CheatsheetFile => ({
    ...file,
    id: String(file.id),
});

class FileStorage {
    isDesktop() {
        return desktopApi() !== undefined;
    }

    async getStorageInfo(): Promise<StorageInfo | null> {
        const api = desktopApi();
        if (!api) return null;
        return api.getStorageInfo();
    }

    async openStorageDir(): Promise<void> {
        const api = desktopApi();
        if (!api) return;
        await api.openStorageDir();
    }

    async loadFiles(): Promise<CheatsheetFile[]> {
        const api = desktopApi();
        if (api) {
            const files = await api.loadFiles();
            return sortByUpdatedAt(files.map(normalize));
        }

        const savedFiles = localStorage.getItem(STORAGE_KEY);
        if (!savedFiles) return [];

        try {
            return sortByUpdatedAt((JSON.parse(savedFiles) as CheatsheetFile[]).map(normalize));
        } catch (error) {
            console.error('Failed to parse saved files:', error);
            return [];
        }
    }

    // Create a brand new cheatsheet, returning the canonical stored file (its id
    // may differ from the requested name if a collision was resolved on disk).
    async createFile(
        name: string,
        content: string,
        toolbarSettings?: ToolbarSettings,
    ): Promise<CheatsheetFile> {
        const api = desktopApi();
        if (api) {
            const file = await api.createFile(name, content, toolbarSettings);
            return normalize(file);
        }

        const now = new Date().toISOString();
        const file: CheatsheetFile = {
            id: String(Date.now()),
            name,
            content,
            createdAt: now,
            updatedAt: now,
            toolbarSettings,
        };
        const files = await this.loadFiles();
        await this.persistWeb([...files, file]);
        return file;
    }

    // Upsert a single file. On desktop this writes only this file, so external
    // edits to other files are never clobbered by autosave.
    async saveFile(file: CheatsheetFile): Promise<CheatsheetFile> {
        const api = desktopApi();
        if (api) {
            const saved = await api.saveFile(
                file.id,
                file.content,
                file.toolbarSettings,
                file.name,
                file.createdAt,
                file.remoteId,
            );
            return normalize(saved);
        }

        const files = await this.loadFiles();
        const updated = { ...file, updatedAt: new Date().toISOString() };
        const next = files.some(f => f.id === file.id)
            ? files.map(f => (f.id === file.id ? updated : f))
            : [...files, updated];
        await this.persistWeb(next);
        return updated;
    }

    async renameFile(id: string, newName: string): Promise<CheatsheetFile> {
        const api = desktopApi();
        if (api) {
            const file = await api.renameFile(id, newName);
            return normalize(file);
        }

        const files = await this.loadFiles();
        let renamed: CheatsheetFile | undefined;
        const next = files.map(f => {
            if (f.id !== id) return f;
            renamed = { ...f, name: newName, updatedAt: new Date().toISOString() };
            return renamed;
        });
        await this.persistWeb(next);
        if (!renamed) throw new Error('File not found');
        return renamed;
    }

    async deleteFile(fileId: string, fallbackFiles: CheatsheetFile[]): Promise<void> {
        const api = desktopApi();
        if (api) {
            await api.deleteFile(fileId);
            return;
        }

        await this.persistWeb(fallbackFiles.filter(file => file.id !== fileId));
    }

    // Bulk upsert. Used by GitHub sync. Desktop upserts each file individually
    // (it never prunes; deletions go through deleteFile).
    async saveFiles(files: CheatsheetFile[]): Promise<CheatsheetFile[]> {
        if (this.isDesktop()) {
            for (const file of files) {
                await this.saveFile(file);
            }
            return this.loadFiles();
        }

        await this.persistWeb(files);
        return sortByUpdatedAt(files.map(normalize));
    }

    // Subscribe to external disk changes (desktop only). Returns an unsubscribe
    // function. No-op on web.
    subscribeToChanges(callback: () => void): () => void {
        const api = desktopApi();
        if (!api) return () => {};
        return api.onCheatsheetsChanged(callback);
    }

    private async persistWeb(files: CheatsheetFile[]): Promise<void> {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    }
}

const fileStorage = new FileStorage();

export default fileStorage;
