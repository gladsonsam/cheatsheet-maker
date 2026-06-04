import { contextBridge, ipcRenderer } from 'electron';

// The single trusted bridge between the sandboxed renderer and the Node-backed
// main process. Everything the frontend can do to the filesystem goes through
// these named channels; there is no raw ipcRenderer or Node access in the page.
const electronAPI = {
    getStorageInfo: (): Promise<{ dir: string }> => ipcRenderer.invoke('storage:getInfo'),
    openStorageDir: (): Promise<void> => ipcRenderer.invoke('storage:open'),
    loadFiles: (): Promise<unknown[]> => ipcRenderer.invoke('storage:load'),
    createFile: (name: string, content: string, toolbarSettings?: unknown): Promise<unknown> =>
        ipcRenderer.invoke('storage:create', name, content, toolbarSettings),
    saveFile: (
        id: string,
        content: string,
        toolbarSettings?: unknown,
        name?: string,
        createdAt?: string,
        remoteId?: string,
    ): Promise<unknown> =>
        ipcRenderer.invoke('storage:save', id, content, toolbarSettings, name, createdAt, remoteId),
    renameFile: (id: string, newName: string): Promise<unknown> =>
        ipcRenderer.invoke('storage:rename', id, newName),
    deleteFile: (id: string): Promise<void> => ipcRenderer.invoke('storage:delete', id),

    // Subscribe to external disk changes detected by the main-process watcher.
    // Returns an unsubscribe function.
    onCheatsheetsChanged: (callback: () => void): (() => void) => {
        const listener = () => callback();
        ipcRenderer.on('cheatsheets-changed', listener);
        return () => ipcRenderer.removeListener('cheatsheets-changed', listener);
    },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
