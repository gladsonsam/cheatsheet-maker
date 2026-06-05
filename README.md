# Cheatsheet Generator

A React-based application for creating and exporting cheatsheets as PDF documents using Markdown.

<img width="1889" height="999" alt="image" src="https://github.com/user-attachments/assets/0e47ec77-42c0-4cd2-a951-99bab3550476" />

<img width="1880" height="1005" alt="image" src="https://github.com/user-attachments/assets/267cfd0b-462a-4f07-871f-774fd3846e32" />

## Features

- Real-time Markdown editing with live preview
- PDF export via browser print
- Customizable multi-column layout (columns, font size, padding, line height, orientation)
- KaTeX math expressions, Mermaid diagrams, HTML in Markdown
- Drag-and-drop image storage (IndexedDB or GitHub)
- Multiple files — create, rename, duplicate, delete, switch
- Push/pull files to/from GitHub for backup and sync
- Light/dark app theme; customizable cheatsheet themes

**Desktop app (Electron — Windows, Linux, macOS)**

- Files saved as plain `.md` files in `Documents/Cheatsheets/` with a `.cheatsheet-meta.json` sidecar for per-file settings
- Live reload — edit any `.md` file with an external tool and the app updates instantly
- Autosave only writes the currently open file, so external edits to other files are never clobbered

## Getting Started

```bash
npm install
npm run dev          # web dev server
npm run build        # production web build

npm run electron:dev   # desktop app in dev mode
npm run electron:pack  # unpacked desktop build (no installer)
npm run electron:dist  # installer for current OS
```

CI builds Windows (`.exe`/`.msi`), Linux (`.AppImage`/`.deb`), and macOS (`.dmg`/`.zip`) on every push; a `v*` tag publishes to a draft GitHub release.

## Tech Stack

React · Vite · Monaco Editor · KaTeX · Mermaid · Electron
