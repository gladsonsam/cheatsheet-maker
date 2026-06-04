import type { CheatsheetFile, ToolbarSettings } from './types';
import type { StorageInfo } from './utils/fileStorage';

// Surface exposed by electron/preload.ts via contextBridge. Present only when
// running inside the Electron desktop shell; undefined in the browser build.
export interface ElectronAPI {
    getStorageInfo(): Promise<StorageInfo>;
    openStorageDir(): Promise<void>;
    loadFiles(): Promise<CheatsheetFile[]>;
    createFile(
        name: string,
        content: string,
        toolbarSettings?: ToolbarSettings,
    ): Promise<CheatsheetFile>;
    saveFile(
        id: string,
        content: string,
        toolbarSettings?: ToolbarSettings,
        name?: string,
        createdAt?: string,
        remoteId?: string,
    ): Promise<CheatsheetFile>;
    renameFile(id: string, newName: string): Promise<CheatsheetFile>;
    deleteFile(id: string): Promise<void>;
    onCheatsheetsChanged(callback: () => void): () => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export {};
