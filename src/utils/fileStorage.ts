import type { CheatsheetFile, ToolbarSettings } from '../types';

export interface StorageInfo {
    dir: string;
}

const STORAGE_KEY = 'cheatsheet_files';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const invokeCommand = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
};

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
        return isTauriRuntime();
    }

    async getStorageInfo(): Promise<StorageInfo | null> {
        if (!this.isDesktop()) return null;
        return invokeCommand<StorageInfo>('get_storage_info');
    }

    async openStorageDir(): Promise<void> {
        if (!this.isDesktop()) return;
        await invokeCommand('open_storage_dir');
    }

    async loadFiles(): Promise<CheatsheetFile[]> {
        if (this.isDesktop()) {
            const files = await invokeCommand<CheatsheetFile[]>('load_files');
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
        if (this.isDesktop()) {
            const file = await invokeCommand<CheatsheetFile>('create_file', {
                name,
                content,
                toolbarSettings,
            });
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
    async saveFile(file: CheatsheetFile): Promise<void> {
        if (this.isDesktop()) {
            await invokeCommand('save_file', {
                id: file.id,
                content: file.content,
                toolbarSettings: file.toolbarSettings,
            });
            return;
        }

        const files = await this.loadFiles();
        const updated = { ...file, updatedAt: new Date().toISOString() };
        const next = files.some(f => f.id === file.id)
            ? files.map(f => (f.id === file.id ? updated : f))
            : [...files, updated];
        await this.persistWeb(next);
    }

    async renameFile(id: string, newName: string): Promise<CheatsheetFile> {
        if (this.isDesktop()) {
            const file = await invokeCommand<CheatsheetFile>('rename_file', { id, newName });
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
        if (this.isDesktop()) {
            await invokeCommand('delete_file', { id: fileId });
            return;
        }

        await this.persistWeb(fallbackFiles.filter(file => file.id !== fileId));
    }

    // Bulk upsert. Used by GitHub sync. Desktop upserts each file individually
    // (it never prunes — deletions go through deleteFile).
    async saveFiles(files: CheatsheetFile[]): Promise<void> {
        if (this.isDesktop()) {
            for (const file of files) {
                await this.saveFile(file);
            }
            return;
        }

        await this.persistWeb(files);
    }

    // Subscribe to external disk changes (desktop only). Returns an unsubscribe
    // function. No-op on web.
    subscribeToChanges(callback: () => void): () => void {
        if (!this.isDesktop()) return () => {};

        let unlisten: (() => void) | undefined;
        let cancelled = false;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen('cheatsheets-changed', () => callback()).then(fn => {
                if (cancelled) {
                    fn();
                } else {
                    unlisten = fn;
                }
            });
        });

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }

    private async persistWeb(files: CheatsheetFile[]): Promise<void> {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    }
}

const fileStorage = new FileStorage();

export default fileStorage;
