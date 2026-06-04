# Cheatsheet Generator

A React-based application for creating and exporting cheatsheets as PDF documents using Markdown.

<img width="1889" height="999" alt="image" src="https://github.com/user-attachments/assets/0e47ec77-42c0-4cd2-a951-99bab3550476" />



<img width="1880" height="1005" alt="image" src="https://github.com/user-attachments/assets/267cfd0b-462a-4f07-871f-774fd3846e32" />




## Features

- Real-time Markdown editing
- Live preview of formatted Markdown content
- PDF export via browser print functionality
- Customizable multi-column layout settings
- Mathematical expressions with KaTeX (lazy-loaded for performance)
- HTML support in Markdown 
- Diagrams with Mermaid
- Drag and drop images directly into the editor with automatic storage in IndexedDB or using GitHub for remote storage

- Automatic saving settings using localStorage
- Create, rename, delete, and switch between multiple files
- Push and pull files to/from GitHub repositories for backup and synchronization

## Desktop app (Electron)

The app also ships as a native desktop build (Windows, Linux, macOS) via
Electron. Because Electron bundles its own Chromium, the desktop app renders
**identically to the web build** on every OS — the same engine, fonts, and
PDF pagination everywhere.

- **Plain-markdown storage** — on desktop, each cheatsheet is saved as a real
  `.md` file in **`Documents/Cheatsheets/`**. Per-file layout settings live in a
  small `.cheatsheet-meta.json` sidecar, so the markdown files stay clean.
- **Live editing** — the app watches that folder. Edit a `.md` file with any
  external tool (including Claude Code) and the open preview/editor update
  instantly. There is also a manual **Refresh** button in the Files panel, and
  an **Open folder** shortcut that reveals the directory in your file manager.
- **No clobbering** — autosave only ever writes the file you currently have
  open, so background edits to other files are never overwritten.

The web build keeps working exactly as before, using `localStorage` and the
GitHub sync for storage.

### Develop / build the desktop app

```
npm run electron:dev     # run the desktop app in dev mode (Vite + Electron)
npm run electron:pack    # build an unpacked app for the current OS (no installer)
npm run electron:dist    # produce installers for the current OS
```

The renderer (`src/`) is bundled by Vite into `dist/`; the Electron main and
preload processes (`electron/`) are bundled by esbuild into `dist-electron/`;
`electron-builder` (config in [`electron-builder.yml`](electron-builder.yml))
packages them into installers.

Installers are built automatically in CI — see
[`.github/workflows/build.yml`](.github/workflows/build.yml). Every push builds
Windows (`.exe`/`.msi`), Linux (`.AppImage`/`.deb`), and macOS (`.dmg`/`.zip`)
artifacts; pushing a `v*` tag (e.g. `v1.0.0`) additionally publishes them to a
draft GitHub release.

## Tech Stack

- React
- Vite
- Monaco Editor for code editing
- KaTeX for mathematical expressions
- Electron for the desktop shell


## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. Build for production:
   ```
   npm run build
   ```

