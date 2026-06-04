import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { FSWatcher, watch } from 'chokidar';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Storage model (ported from the previous Tauri Rust backend, src-tauri/src/lib.rs).
//
// A cheatsheet is a plain `.md` file inside <Documents>/Cheatsheets. The file
// stem (name without extension) is both the `id` and the `name`; identity is
// the file on disk, which keeps things predictable when files are edited
// externally. Per-file extras (the original creation time and the toolbar
// settings) live in a sidecar `.cheatsheet-meta.json` keyed by stem, so the
// `.md` files themselves stay pure markdown.
// ---------------------------------------------------------------------------

const FOLDER_NAME = 'Cheatsheets';
const META_FILE = '.cheatsheet-meta.json';

interface CheatsheetFile {
    id: string;
    name: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    toolbarSettings?: unknown;
    remoteId?: string;
}

interface MetaEntry {
    createdAt?: string;
    toolbarSettings?: unknown;
    remoteId?: string;
}

type MetaMap = Record<string, MetaEntry>;

function storageDir(): string {
    const dir = path.join(app.getPath('documents'), FOLDER_NAME);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function metaPath(dir: string): string {
    return path.join(dir, META_FILE);
}

function readMeta(dir: string): MetaMap {
    try {
        const raw = fs.readFileSync(metaPath(dir), 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as MetaMap) : {};
    } catch {
        return {};
    }
}

function writeMeta(dir: string, meta: MetaMap): void {
    fs.writeFileSync(metaPath(dir), JSON.stringify(meta, null, 2));
}

/** Turn an arbitrary cheatsheet name into a safe file stem. */
function sanitizeStem(name: string): string {
    const cleaned = Array.from(name)
        .map((c) => {
            if ('\\/:*?"<>|'.includes(c)) return '_';
            if (c.charCodeAt(0) < 0x20) return '_';
            return c;
        })
        .join('');
    const trimmed = cleaned.trim().replace(/^\.+|\.+$/g, '').trim();
    return trimmed.length === 0 ? 'Untitled' : trimmed;
}

/**
 * Resolve a unique stem within `dir`, ignoring `ignore` (used when renaming so
 * a file does not collide with itself).
 */
function uniqueStem(dir: string, desired: string, ignore?: string): string {
    const base = sanitizeStem(desired);
    const exists = (stem: string): boolean => {
        if (stem === ignore) return false;
        return fs.existsSync(filePath(dir, stem));
    };

    if (!exists(base)) return base;
    let counter = 2;
    for (;;) {
        const candidate = `${base} (${counter})`;
        if (!exists(candidate)) return candidate;
        counter += 1;
    }
}

function filePath(dir: string, stem: string): string {
    return path.join(dir, `${stem}.md`);
}

function readOne(dir: string, stem: string, meta: MetaMap): CheatsheetFile {
    const fullPath = filePath(dir, stem);
    const content = fs.readFileSync(fullPath, 'utf-8');
    let stat: fs.Stats | undefined;
    try {
        stat = fs.statSync(fullPath);
    } catch {
        stat = undefined;
    }

    const updatedAt = stat ? stat.mtime.toISOString() : new Date().toISOString();
    const entry = meta[stem];
    const createdAt =
        entry?.createdAt ??
        (stat ? stat.birthtime.toISOString() : undefined) ??
        updatedAt;

    return {
        id: stem,
        name: stem,
        content,
        createdAt,
        updatedAt,
        toolbarSettings: entry?.toolbarSettings,
        remoteId: entry?.remoteId,
    };
}

function getStorageInfo(): { dir: string } {
    return { dir: storageDir() };
}

function loadFiles(): CheatsheetFile[] {
    const dir = storageDir();
    const meta = readMeta(dir);

    const files: CheatsheetFile[] = [];
    for (const name of fs.readdirSync(dir)) {
        if (!name.toLowerCase().endsWith('.md')) continue;
        const stem = name.slice(0, -3);
        try {
            files.push(readOne(dir, stem, meta));
        } catch (error) {
            console.error(`Skipping ${stem}:`, error);
        }
    }

    files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return files;
}

function createFile(
    name: string,
    content: string,
    toolbarSettings?: unknown,
): CheatsheetFile {
    const dir = storageDir();
    const stem = uniqueStem(dir, name);
    fs.writeFileSync(filePath(dir, stem), content);

    const meta = readMeta(dir);
    meta[stem] = {
        createdAt: new Date().toISOString(),
        toolbarSettings,
    };
    writeMeta(dir, meta);

    return readOne(dir, stem, meta);
}

function saveFile(
    id: string,
    content: string,
    toolbarSettings?: unknown,
    name?: string,
    createdAt?: string,
    remoteId?: string,
): CheatsheetFile {
    const dir = storageDir();
    const requestedStem = sanitizeStem(id);
    const nameStem = typeof name === 'string' ? sanitizeStem(name) : requestedStem;
    const meta = readMeta(dir);
    const existingRemoteStem =
        remoteId === undefined
            ? undefined
            : Object.entries(meta).find(([, entry]) => entry.remoteId === remoteId)?.[0];
    const stem = existingRemoteStem
        ? existingRemoteStem
        : fs.existsSync(filePath(dir, requestedStem))
          ? requestedStem
          : remoteId !== undefined
            ? uniqueStem(dir, nameStem)
            : fs.existsSync(filePath(dir, nameStem))
              ? nameStem
              : nameStem !== requestedStem
                ? uniqueStem(dir, nameStem)
                : requestedStem;
    fs.writeFileSync(filePath(dir, stem), content);

    const entry: MetaEntry = meta[stem] ?? {};
    if (!entry.createdAt) {
        entry.createdAt = createdAt || new Date().toISOString();
    }
    if (toolbarSettings !== undefined && toolbarSettings !== null) {
        entry.toolbarSettings = toolbarSettings;
    }
    if (remoteId !== undefined) {
        entry.remoteId = remoteId;
    }
    meta[stem] = entry;
    writeMeta(dir, meta);
    return readOne(dir, stem, meta);
}

function renameFile(id: string, newName: string): CheatsheetFile {
    const dir = storageDir();
    const oldStem = sanitizeStem(id);
    const newStem = uniqueStem(dir, newName, oldStem);

    if (oldStem !== newStem) {
        fs.renameSync(filePath(dir, oldStem), filePath(dir, newStem));

        const meta = readMeta(dir);
        if (meta[oldStem]) {
            meta[newStem] = meta[oldStem];
            delete meta[oldStem];
        }
        writeMeta(dir, meta);
    }

    const meta = readMeta(dir);
    return readOne(dir, newStem, meta);
}

function deleteFile(id: string): void {
    const dir = storageDir();
    const stem = sanitizeStem(id);
    const fullPath = filePath(dir, stem);
    if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath);
    }

    const meta = readMeta(dir);
    if (meta[stem]) {
        delete meta[stem];
        writeMeta(dir, meta);
    }
}

async function openStorageDir(): Promise<void> {
    const dir = storageDir();
    const error = await shell.openPath(dir);
    if (error) {
        throw new Error(`Failed to open folder: ${error}`);
    }
}

/**
 * One-time migration from the previous app-data storage layout
 * (`<userData>/files.json` + `content/<id>.md`) into the new
 * Documents/Cheatsheets folder of named markdown files.
 */
function migrateLegacyStorage(dir: string): void {
    // Only migrate into an empty folder so we never clobber real files.
    const alreadyPopulated = fs
        .readdirSync(dir)
        .some((name) => name.toLowerCase().endsWith('.md'));
    if (alreadyPopulated) return;

    const appData = app.getPath('userData');
    const indexPath = path.join(appData, 'files.json');
    let records: Array<Record<string, unknown>>;
    try {
        records = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {
        return;
    }
    if (!Array.isArray(records)) return;

    const meta = readMeta(dir);
    for (const record of records) {
        const rawId = record.id;
        const idStr =
            typeof rawId === 'number'
                ? String(rawId)
                : typeof rawId === 'string'
                  ? rawId
                  : undefined;
        if (idStr === undefined) continue;

        const name = typeof record.name === 'string' ? record.name : 'Untitled';
        const legacyContent = path.join(appData, 'content', `${idStr}.md`);
        let content = '';
        try {
            content = fs.readFileSync(legacyContent, 'utf-8');
        } catch {
            content = '';
        }

        const stem = uniqueStem(dir, name);
        try {
            fs.writeFileSync(filePath(dir, stem), content);
            meta[stem] = {
                createdAt:
                    typeof record.createdAt === 'string' ? record.createdAt : undefined,
                toolbarSettings: record.toolbarSettings,
            };
        } catch {
            // Skip files we can't write; migration is best-effort.
        }
    }
    writeMeta(dir, meta);
}

let watcher: FSWatcher | undefined;

function startWatcher(dir: string, window: BrowserWindow): void {
    // Watch only the top level of the storage directory (matches the previous
    // non-recursive Rust watcher). Ignore changes that only touch our sidecar
    // metadata file so saving toolbar settings doesn't trigger a reload loop.
    watcher = watch(dir, {
        depth: 0,
        ignoreInitial: true,
        ignored: (p: string) => path.basename(p) === META_FILE,
    });

    const notify = () => {
        if (!window.isDestroyed()) {
            window.webContents.send('cheatsheets-changed');
        }
    };

    watcher.on('add', notify).on('change', notify).on('unlink', notify);
}

function registerIpcHandlers(): void {
    ipcMain.handle('storage:getInfo', () => getStorageInfo());
    ipcMain.handle('storage:open', () => openStorageDir());
    ipcMain.handle('storage:load', () => loadFiles());
    ipcMain.handle('storage:create', (_e, name: string, content: string, toolbarSettings?: unknown) =>
        createFile(name, content, toolbarSettings),
    );
    ipcMain.handle(
        'storage:save',
        (
            _e,
            id: string,
            content: string,
            toolbarSettings?: unknown,
            name?: string,
            createdAt?: string,
            remoteId?: string,
        ) => saveFile(id, content, toolbarSettings, name, createdAt, remoteId),
    );
    ipcMain.handle('storage:rename', (_e, id: string, newName: string) =>
        renameFile(id, newName),
    );
    ipcMain.handle('storage:delete', (_e, id: string) => deleteFile(id));
}

function createWindow(): void {
    const window = new BrowserWindow({
        title: 'Cheatsheet Maker',
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 640,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) {
        void window.loadURL(devUrl);
        window.webContents.openDevTools({ mode: 'detach' });
    } else {
        void window.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    try {
        const dir = storageDir();
        migrateLegacyStorage(dir);
        startWatcher(dir, window);
    } catch (error) {
        console.error('Storage setup failed:', error);
    }
}

// Open links with a target of _blank (e.g. the GitHub token page) in the user's
// real browser instead of a new Electron window.
app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            void shell.openExternal(url);
        }
        return { action: 'deny' };
    });
});

app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        void watcher?.close();
        app.quit();
    }
});
