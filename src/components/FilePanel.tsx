import { useState, useEffect } from 'react';
import { File, Plus, Trash2, Edit2, Check, X, Image, Link, Eye, Github, Cloud, FolderOpen, RefreshCw, Copy } from 'lucide-react';
import imageStorage from '../utils/imageStorage';
import githubSync from '../utils/githubSync';
import fileStorage from '../utils/fileStorage';
import type { ToolbarSettings } from '../types';
import SyncSettings from './SyncSettings';
import './FilePanel.css';

function FilePanel({ isOpen, onClose, currentFile, onFileChange, onNewFile, onActiveFileReplaced, markdown, toolbarSettings }) {
    const [files, setFiles] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [images, setImages] = useState([]);
    const [showImages, setShowImages] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showSync, setShowSync] = useState(false);
    const [storageInfo, setStorageInfo] = useState(null);

    // Template presets.
    const templates = {
        cheatsheet: {
            name: 'Cheatsheet',
            description: 'Dense multi-column landscape layout',
            toolbarSettings: {
                columns: 5,
                fontSize: 8,
                padding: 5,
                gap: 1,
                lineHeight: 1.2,
                orientation: 'landscape',
                theme: 'classic',
                fontFamily: 'inter'
            },
            content: ''
        },
        note: {
            name: 'Study Notes',
            description: 'Readable single-column portrait layout',
            toolbarSettings: {
                columns: 1,
                fontSize: 12,
                padding: 15,
                gap: 5,
                lineHeight: 1.5,
                orientation: 'portrait',
                theme: 'classic',
                fontFamily: 'inter'
            },
            content: ''
        },
        math: {
            name: 'Math / Physics',
            description: 'KaTeX formulas, 3-column landscape',
            toolbarSettings: {
                columns: 3,
                fontSize: 9,
                padding: 8,
                gap: 2,
                lineHeight: 1.3,
                orientation: 'landscape',
                theme: 'classic',
                fontFamily: 'inter'
            },
            content: `# Math & Physics Reference

## Algebra
**Quadratic:** $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

**Binomial:** $(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k$

## Calculus
**Derivative rules:**
- Power: $(x^n)' = nx^{n-1}$
- Product: $(uv)' = u'v + uv'$
- Chain: $(f(g(x)))' = f'(g(x)) \\cdot g'(x)$

**Integrals:**
- $\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$
- $\\int e^x\\,dx = e^x + C$
- $\\int \\sin x\\,dx = -\\cos x + C$

## Physics
**Kinematics:** $v = v_0 + at$, $s = v_0 t + \\frac{1}{2}at^2$

**Newton's 2nd:** $F = ma$

**Energy:** $E_k = \\frac{1}{2}mv^2$, $E_p = mgh$

**Waves:** $v = f\\lambda$

## Trigonometry
| Identity | Formula |
|----------|---------|
| $\\sin^2 + \\cos^2$ | $= 1$ |
| $\\tan\\theta$ | $= \\frac{\\sin\\theta}{\\cos\\theta}$ |
| $\\sin 2\\theta$ | $= 2\\sin\\theta\\cos\\theta$ |
`
        },
        code: {
            name: 'Code Reference',
            description: 'Syntax-highlighted code, 3-column landscape',
            toolbarSettings: {
                columns: 3,
                fontSize: 8,
                padding: 6,
                gap: 2,
                lineHeight: 1.25,
                orientation: 'landscape',
                theme: 'midnight',
                fontFamily: 'jetbrains-mono'
            },
            content: `# Code Reference

## Variables & Types
\`\`\`python
x: int = 42
name: str = "Alice"
items: list[int] = [1, 2, 3]
data: dict[str, int] = {"a": 1}
\`\`\`

## Control Flow
\`\`\`python
# Conditional
if x > 0:
    print("positive")
elif x == 0:
    print("zero")
else:
    print("negative")

# Loop
for i in range(10):
    if i % 2 == 0:
        continue
    print(i)
\`\`\`

## Functions
\`\`\`python
def greet(name: str, times: int = 1) -> str:
    return f"Hello, {name}! " * times

# Lambda
square = lambda x: x ** 2

# List comprehension
evens = [x for x in range(20) if x % 2 == 0]
\`\`\`

## Classes
\`\`\`python
class Animal:
    def __init__(self, name: str):
        self.name = name

    def speak(self) -> str:
        return f"{self.name} says hello"

class Dog(Animal):
    def speak(self) -> str:
        return f"{self.name} barks!"
\`\`\`
`
        },
        vocab: {
            name: 'Vocabulary / Language',
            description: 'Table-heavy layout for word lists',
            toolbarSettings: {
                columns: 2,
                fontSize: 9,
                padding: 8,
                gap: 3,
                lineHeight: 1.4,
                orientation: 'portrait',
                theme: 'classic',
                fontFamily: 'inter'
            },
            content: `# Vocabulary Reference

## Unit 1 — Core Terms

| Word | Definition | Example |
|------|-----------|---------|
| **Ephemeral** | Lasting a very short time | Morning dew is *ephemeral* |
| **Ubiquitous** | Present everywhere | Smartphones are *ubiquitous* |
| **Pragmatic** | Dealing with things practically | A *pragmatic* solution |
| **Ambiguous** | Open to more than one interpretation | An *ambiguous* statement |
| **Cogent** | Clear and convincing | A *cogent* argument |

## Unit 2 — Academic Vocabulary

| Word | Part of Speech | Meaning |
|------|---------------|---------|
| **Analyze** | verb | Examine in detail |
| **Hypothesis** | noun | A proposed explanation |
| **Synthesize** | verb | Combine into a whole |
| **Correlate** | verb | Have a relationship |
| **Infer** | verb | Deduce from evidence |

## Prefixes & Suffixes

| Affix | Meaning | Examples |
|-------|---------|---------|
| **pre-** | before | preview, predict |
| **sub-** | under/below | submarine, subtext |
| **-ology** | study of | biology, psychology |
| **-ify** | to make | clarify, justify |
`
        }
    };

    const withCurrentFileState = (loadedFiles) => {
        if (!currentFile) return loadedFiles;

        return loadedFiles.map(file =>
            file.id === currentFile.id
                ? {
                    ...file,
                    content: markdown,
                    toolbarSettings: toolbarSettings || file.toolbarSettings
                }
                : file
        );
    };

    const loadFiles = async () => {
        try {
            const storedFiles = await fileStorage.loadFiles();
            if (storedFiles.length > 0) {
                const mergedFiles = withCurrentFileState(storedFiles);
                setFiles(mergedFiles);
                return;
            }

            const defaultToolbarSettings: ToolbarSettings = {
                columns: 5,
                fontSize: 8,
                padding: 5,
                gap: 1,
                lineHeight: 1.2,
                orientation: 'landscape',
                theme: 'classic',
                fontFamily: 'inter'
            };

            const defaultFile = await fileStorage.createFile('Untitled', markdown, defaultToolbarSettings);
            setFiles([defaultFile]);
        } catch (e) {
            console.error('Failed to load files:', e);
            setFiles([]);
        }
    };

    // Load the file list from the active storage backend whenever the panel opens.
    useEffect(() => {
        if (!isOpen) return;

        loadFiles();

        if (fileStorage.isDesktop()) {
            fileStorage.getStorageInfo().then(setStorageInfo).catch(error => {
                console.error('Failed to load desktop storage info:', error);
            });
        } else {
            setStorageInfo(null);
        }
    }, [isOpen]);

    // While the panel is open, keep the list in sync with external disk changes
    // (files created/renamed/deleted by Claude Code or another editor).
    useEffect(() => {
        if (!isOpen) return;
        let timer: ReturnType<typeof setTimeout>;
        const unsubscribe = fileStorage.subscribeToChanges(() => {
            clearTimeout(timer);
            timer = setTimeout(() => loadFiles(), 200);
        });
        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
    }, [isOpen]);

    // Load image records.
    useEffect(() => {
        if (isOpen && showImages) {
            loadImages();
        }
    }, [isOpen, showImages]);

    const loadImages = async () => {
        try {
            // 1. Load locally stored images.
            const localImages = await imageStorage.getAllImages();

            // 2. Extract GitHub-hosted images from all Markdown files.
            const githubImages = [];
            const githubImagePattern = /!\[([^\]]*)\]\((https:\/\/raw\.githubusercontent\.com\/[^)]+)\)/g;

            for (const file of files) {
                const matches = [...file.content.matchAll(githubImagePattern)];
                for (const match of matches) {
                    const [, alt, url] = match;
                    // Avoid adding the same URL more than once.
                    if (!githubImages.find(img => img.url === url)) {
                        // Extract a file name from the URL.
                        const fileName = url.split('/').pop() || 'github-image';
                        githubImages.push({
                            id: url, // Use the URL as the ID.
                            name: alt || fileName,
                            url: url,
                            type: 'github',
                            timestamp: Date.now(), // Use the current time as a placeholder.
                            sourceFile: file.name
                        });
                    }
                }
            }

            // 3. Convert local images to a consistent display shape.
            const formattedLocalImages = localImages.map(img => ({
                ...img,
                type: 'local',
                url: img.data // Local images use the data field as their URL.
            }));

            // 4. Merge local and GitHub images.
            const allImages = [...formattedLocalImages, ...githubImages];

            // 5. Sort by time, newest first.
            allImages.sort((a, b) => b.timestamp - a.timestamp);

            setImages(allImages);
        } catch (error) {
            console.error('Failed to load images:', error);
        }
    };

    // Save the file list to the active storage backend.
    const saveFiles = async (updatedFiles) => {
        const savedFiles = await fileStorage.saveFiles(updatedFiles);
        setFiles(savedFiles);
        return savedFiles;
    };

    // Create a new file.
    const handleNewFile = async () => {
        const settings = toolbarSettings || {
            columns: 5,
            fontSize: 8,
            padding: 5,
            gap: 1,
            lineHeight: 1.2,
            orientation: 'landscape' as const,
            theme: 'classic',
            fontFamily: 'inter'
        };
        const newFile = await fileStorage.createFile('Untitled', '', settings);
        setFiles([...files, newFile]);
        onNewFile(newFile);
    };

    // Create a new file from a template.
    const handleCreateFromTemplate = async (templateKey) => {
        const template = templates[templateKey];
        const newFile = await fileStorage.createFile(template.name, template.content || '', { ...template.toolbarSettings });
        setFiles([...files, newFile]);
        onNewFile(newFile);
        setShowTemplates(false);
    };

    // Duplicate a file.
    const handleDuplicateFile = async (file) => {
        const name = `Copy of ${file.name}`;
        const content = file.id === currentFile?.id ? markdown : file.content;
        const settings = file.id === currentFile?.id ? toolbarSettings : file.toolbarSettings;
        const newFile = await fileStorage.createFile(name, content, settings);
        setFiles(prev => [...prev, newFile]);
        onNewFile(newFile);
    };

    // Delete a file.
    const handleDeleteFile = async (fileId) => {
        if (files.length === 1) {
            alert('Cannot delete the last file');
            return;
        }
        if (confirm('Are you sure you want to delete this file?')) {
            const updatedFiles = files.filter(file => file.id !== fileId);
            await fileStorage.deleteFile(fileId, files).catch(error => {
                console.error('Failed to delete file from storage:', error);
                alert('Failed to delete file');
            });
            setFiles(updatedFiles);

            // If the current file was deleted, switch to the first remaining file.
            if (currentFile && currentFile.id === fileId) {
                onFileChange(updatedFiles[0]);
            }
        }
    };

    // Delete an image.
    const handleDeleteImage = async (imageId) => {
        if (confirm('Are you sure you want to delete this image?')) {
            try {
                await imageStorage.deleteImage(imageId);
                setImages(images.filter(img => img.id !== imageId));
                if (previewImage && previewImage.id === imageId) {
                    setPreviewImage(null);
                }
            } catch (error) {
                console.error('Failed to delete image:', error);
                alert('Failed to delete image');
            }
        }
    };

    // Copy an image link.
    const handleCopyLink = (image) => {
        // GitHub images use their URL directly; local images use their stored ID.
        const imageRef = image.type === 'github' ? image.url : image.id;
        const link = `![${image.name || 'image'}](${imageRef})`;
        navigator.clipboard.writeText(link).then(() => {
            alert('Image link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link');
        });
    };

    // Preview an image.
    const handlePreviewImage = async (image) => {
        // GitHub image previews use the url field.
        if (image.type === 'github') {
            setPreviewImage({ ...image, data: image.url });
        } else {
            setPreviewImage(image);
        }
    };

    // Close the image preview.
    const handleClosePreview = () => {
        setPreviewImage(null);
    };

    // Start renaming a file.
    const handleStartRename = (file) => {
        setEditingId(file.id);
        setEditingName(file.name);
    };

    // Confirm a rename.
    const handleConfirmRename = async (fileId) => {
        if (!editingName.trim()) {
            alert('File name cannot be empty');
            return;
        }
        try {
            const isCurrent = currentFile && currentFile.id === fileId;
            // Persist the latest in-memory edits to the old file first so the
            // rename carries the newest content across to the new filename.
            if (isCurrent) {
                await fileStorage.saveFile({ ...currentFile, content: markdown, toolbarSettings });
            }
            const renamed = await fileStorage.renameFile(fileId, editingName.trim());
            setFiles(files.map(file => (file.id === fileId ? { ...renamed, content: file.content } : file)));
            // The id can change on desktop (it tracks the filename), so re-point
            // the active file at the renamed entry without re-saving the old one.
            if (isCurrent) {
                onActiveFileReplaced({ ...renamed, content: markdown });
            }
        } catch (error) {
            console.error('Failed to rename file:', error);
            alert('Failed to rename file');
        }
        setEditingId(null);
        setEditingName('');
    };

    // Cancel renaming.
    const handleCancelRename = () => {
        setEditingId(null);
        setEditingName('');
    };

    // Format dates for display.
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handlePushFiles = async (token, owner, repo) => {
        const filesForSync = withCurrentFileState(files);
        await saveFiles(filesForSync);
        const normalizedFiles = [];

        for (const file of filesForSync) {
            let content = file.content;

            // Convert legacy inline data URLs before syncing so markdown stays small.
            const imageMapping = await githubSync.extractImagesFromMarkdown(content, imageStorage);
            content = githubSync.replaceImageReferencesWithIds(content, imageMapping);

            normalizedFiles.push({
                ...file,
                content
            });
        }

        // 1. Upload index file (metadata)
        const indexContent = JSON.stringify(normalizedFiles.map(f => ({
            id: f.remoteId || f.id,
            name: f.name,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            toolbarSettings: f.toolbarSettings
        })), null, 2);

        await githubSync.uploadFile(token, owner, repo, 'files.json', indexContent, 'Update file index');

        // 2. Upload each file content and the local image records it references.
        const uploadedImageIds = new Set();
        for (const file of normalizedFiles) {
            const syncId = file.remoteId || file.id;
            const filename = `content/${syncId}.md`;
            await githubSync.uploadFile(token, owner, repo, filename, file.content, `Update ${file.name}`);

            const imageIds = githubSync.getImageIdsFromMarkdown(file.content);
            for (const imageId of imageIds) {
                if (uploadedImageIds.has(imageId)) continue;

                const image = await imageStorage.getImage(imageId);
                if (image) {
                    await githubSync.uploadImage(token, owner, repo, image);
                    uploadedImageIds.add(imageId);
                } else {
                    console.warn(`Skipping missing local image: ${imageId}`);
                }
            }
        }

        if (JSON.stringify(normalizedFiles) !== JSON.stringify(filesForSync)) {
            await saveFiles(normalizedFiles);
        }
    };

    const handlePullFiles = async (token, owner, repo) => {
        const localFiles = withCurrentFileState(await fileStorage.loadFiles());
        const isDesktop = fileStorage.isDesktop();

        // 1. Get index file; if absent, fall back to scanning the repo for .md files
        const indexContent = await githubSync.getFileContent(token, owner, repo, 'files.json');

        let remoteFiles;
        if (indexContent) {
            remoteFiles = JSON.parse(indexContent);
        } else {
            // No files.json: scan the content/ subfolder first, then the root.
            const isMd = (e) => e.type === 'file' && e.name.toLowerCase().endsWith('.md');
            const SKIP_ROOT = new Set(['readme.md', 'license.md', 'changelog.md']);

            const contentEntries = await githubSync.listDirectory(token, owner, repo, 'content');
            let mdEntries = (contentEntries ?? []).filter(isMd);

            if (mdEntries.length === 0) {
                const rootEntries = await githubSync.listDirectory(token, owner, repo, '');
                mdEntries = (rootEntries ?? []).filter(
                    e => isMd(e) && !SKIP_ROOT.has(e.name.toLowerCase())
                );
            }

            if (mdEntries.length === 0) {
                throw new Error('No files found in repository');
            }

            const now = new Date().toISOString();
            remoteFiles = mdEntries.map(e => {
                const stem = e.name.slice(0, -3);
                return {
                    id: stem,
                    name: stem,
                    createdAt: now,
                    updatedAt: now,
                    _rawPath: e.path,
                };
            });
        }

        const mergedFiles = [...localFiles];
        let updatedCount = 0;
        let activeFileWasUpdated = false;
        const claimedLocalIndexes = new Set<number>();

        // 2. Merge / overwrite with remote files
        for (const remoteFile of remoteFiles) {
            const remoteId = String(remoteFile.id);
            const remotePathStem =
                typeof remoteFile._rawPath === 'string'
                    ? remoteFile._rawPath.split('/').pop()?.replace(/\.md$/i, '')
                    : undefined;
            const remoteName =
                typeof remoteFile.name === 'string' && remoteFile.name.trim()
                    ? remoteFile.name.trim()
                    : remotePathStem || remoteId;
            const localFileIndex = mergedFiles.findIndex((f, index) =>
                f.id === remoteId ||
                (isDesktop && (
                    f.remoteId === remoteId ||
                    (!f.remoteId && !claimedLocalIndexes.has(index) && f.name === remoteName)
                ))
            );
            const localFile = mergedFiles[localFileIndex];
            if (localFileIndex !== -1) {
                claimedLocalIndexes.add(localFileIndex);
            }

            // Always overwrite on desktop (source-of-truth pull).
            // On web, pull everything that doesn't exist locally or that is newer.
            let shouldUpdate = false;
            if (isDesktop) {
                shouldUpdate = true;
            } else if (!localFile) {
                shouldUpdate = true;
            } else {
                const remoteDate = new Date(remoteFile.updatedAt);
                const localDate = new Date(localFile.updatedAt);
                if (remoteDate > localDate) {
                    shouldUpdate = true;
                }
            }

            if (shouldUpdate) {
                // Prefer structured path (files.json-backed); fall back to raw path for scanned files
                const contentPath = remoteFile._rawPath ?? `content/${remoteId}.md`;
                let content = await githubSync.getFileContent(token, owner, repo, contentPath);
                if (content !== null) {
                    // Extract legacy embedded images and restore them to IndexedDB
                    const imageMapping = await githubSync.extractImagesFromMarkdown(content, imageStorage);
                    content = githubSync.replaceImageReferencesWithIds(content, imageMapping);

                    // Restore synced image records. Uses authenticated API, so private repos work.
                    const imageIds = githubSync.getImageIdsFromMarkdown(content);
                    for (const imageId of imageIds) {
                        const remoteImage = await githubSync.downloadImage(token, owner, repo, imageId);
                        if (remoteImage?.data) {
                            await imageStorage.saveImageData(remoteImage);
                        } else {
                            console.warn(`Image not found in repository: ${imageId}`);
                        }
                    }

                    const newFile = {
                        ...remoteFile,
                        id: isDesktop && localFile ? localFile.id : remoteId,
                        name: remoteName,
                        content,
                        remoteId,
                    };
                    // Remove internal helper field before saving
                    delete newFile._rawPath;

                    if (localFileIndex !== -1) {
                        mergedFiles[localFileIndex] = newFile;
                    } else {
                        mergedFiles.push(newFile);
                    }
                    if (
                        currentFile &&
                        (
                            currentFile.id === remoteId ||
                            (isDesktop && (
                                currentFile.remoteId === remoteId ||
                                currentFile.name === remoteName
                            ))
                        )
                    ) {
                        activeFileWasUpdated = true;
                    }
                    updatedCount++;
                } else {
                    console.warn(`Content not found in repository for: ${remoteFile.id}`);
                }
            }
        }

        if (updatedCount > 0) {
            // Sort by updated time
            mergedFiles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            const savedFiles = await saveFiles(mergedFiles);

            // If the active file was updated, refresh it without running the
            // normal switch handler, which saves the pre-pull editor contents.
            if (currentFile && activeFileWasUpdated) {
                const updatedCurrent = savedFiles.find(f =>
                    f.id === currentFile.id ||
                    (isDesktop && (
                        (currentFile.remoteId && f.remoteId === currentFile.remoteId) ||
                        f.name === currentFile.name
                    ))
                );
                if (updatedCurrent) {
                    onActiveFileReplaced(updatedCurrent);
                }
            }

            // Explicitly reload the panel list so it reflects the latest disk state
            // even if the watcher debounce hasn't fired yet.
            await loadFiles();

            return `Pulled ${updatedCount} ${updatedCount === 1 ? 'file' : 'files'} from GitHub.`;
        }

        return 'Local files are already up to date.';
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="file-panel-overlay" onClick={onClose}></div>
            <div className="file-panel">
                <div className="file-panel-header">
                    <div className="file-panel-header-content">
                        <h2>{showImages ? 'Images' : 'Files'}</h2>
                    </div>
                    <div className="header-actions">
                        <button className="btn-icon" onClick={() => setShowSync(true)} title="Sync to GitHub">
                            <Cloud size={20} />
                        </button>
                        <button className="btn-close" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="file-panel-actions">
                    {!showImages && !showTemplates ? (
                        <>
                            <button className="btn btn-primary" onClick={handleNewFile}>
                                <Plus size={16} />
                                New File
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>
                                <Plus size={16} />
                                Template
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowImages(true)}>
                                <Image size={16} />
                                Images
                            </button>
                        </>
                    ) : showTemplates ? (
                        <button className="btn btn-secondary" onClick={() => setShowTemplates(false)}>
                            <File size={16} />
                            Back to Files
                        </button>
                    ) : (
                        <button className="btn btn-secondary" onClick={() => setShowImages(false)}>
                            <File size={16} />
                            Back to Files
                        </button>
                    )}
                </div>

                {storageInfo && !showImages && !showTemplates && (
                    <div className="desktop-storage-note">
                        <button
                            className="storage-open"
                            onClick={() => fileStorage.openStorageDir()}
                            title={`Open ${storageInfo.dir} in your file manager`}
                        >
                            <FolderOpen size={14} />
                            <span className="storage-path">{storageInfo.dir}</span>
                            <span className="storage-open-hint">Open folder</span>
                        </button>
                        <button
                            className="storage-refresh"
                            onClick={loadFiles}
                            title="Reload files from disk"
                        >
                            <RefreshCw size={14} />
                            Refresh
                        </button>
                    </div>
                )}

                <div className="file-list">
                    {!showImages && !showTemplates ? (
                        files.map(file => (
                            <div
                                key={file.id}
                                className={`file-item ${currentFile && currentFile.id === file.id ? 'active' : ''}`}
                            >
                                <div className="file-item-main" onClick={() => onFileChange(file)}>
                                    <File size={16} className="file-icon" />
                                    <div className="file-info">
                                        {editingId === file.id ? (
                                            <div className="file-name-edit">
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleConfirmRename(file.id);
                                                        } else if (e.key === 'Escape') {
                                                            handleCancelRename();
                                                        }
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    className="btn-icon"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleConfirmRename(file.id);
                                                    }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    className="btn-icon"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCancelRename();
                                                    }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="file-name">{file.name}</div>
                                                <div className="file-meta">
                                                    Updated: {formatDate(file.updatedAt)}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {editingId !== file.id && (
                                    <div className="file-actions">
                                        <button
                                            className="btn-icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDuplicateFile(file);
                                            }}
                                            title="Duplicate"
                                        >
                                            <Copy size={14} />
                                        </button>
                                        <button
                                            className="btn-icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartRename(file);
                                            }}
                                            title="Rename"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            className="btn-icon btn-danger"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteFile(file.id);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : showTemplates ? (
                        Object.entries(templates).map(([key, template]) => (
                            <div
                                key={key}
                                className="file-item template-item"
                                onClick={() => handleCreateFromTemplate(key)}
                            >
                                <div className="file-item-main">
                                    <File size={16} className="file-icon" />
                                    <div className="file-info">
                                        <div className="file-name">{template.name}</div>
                                        <div className="file-meta">
                                            {template.description}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        images.map(image => (
                            <div key={image.id} className="file-item">
                                <div className="file-item-main">
                                    {image.type === 'github' ? (
                                        <Github size={16} className="file-icon" style={{ color: '#6366f1' }} />
                                    ) : (
                                        <Image size={16} className="file-icon" />
                                    )}
                                    <div className="file-info">
                                        <div className="file-name">
                                            {image.name}
                                            {image.type === 'github' && (
                                                <span style={{ marginLeft: '8px', fontSize: '10px', color: '#6366f1', fontWeight: 'bold' }}>
                                                    GitHub
                                                </span>
                                            )}
                                        </div>
                                        <div className="file-meta">
                                            {image.type === 'github' ? (
                                                `From: ${image.sourceFile}`
                                            ) : (
                                                `Added: ${formatDate(new Date(image.timestamp).toISOString())}`
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="file-actions">
                                    <button
                                        className="btn-icon"
                                        onClick={() => handlePreviewImage(image)}
                                        title="Preview"
                                    >
                                        <Eye size={14} />
                                    </button>
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleCopyLink(image)}
                                        title="Copy Link"
                                    >
                                        <Link size={14} />
                                    </button>
                                    {image.type === 'local' && (
                                        <button
                                            className="btn-icon btn-danger"
                                            onClick={() => handleDeleteImage(image.id)}
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Image preview modal */}
            {previewImage && (
                <div className="image-preview-overlay" onClick={handleClosePreview}>
                    <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
                        <div className="image-preview-header">
                            <h3>{previewImage.name}</h3>
                            <button className="btn-close" onClick={handleClosePreview}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="image-preview-content">
                            <img src={previewImage.data} alt={previewImage.name} />
                        </div>
                    </div>
                </div>
            )}

            <SyncSettings
                isOpen={showSync}
                onClose={() => setShowSync(false)}
                onPush={handlePushFiles}
                onPull={handlePullFiles}
            />
        </>
    );
}

export default FilePanel;
