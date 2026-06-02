import { useState, useEffect } from 'react';
import { File, Plus, Trash2, Edit2, Check, X, Image, Copy, Link, Eye, Github, Cloud } from 'lucide-react';
import imageStorage from '../utils/imageStorage';
import githubSync from '../utils/githubSync';
import SyncSettings from './SyncSettings';
import './FilePanel.css';

function FilePanel({ isOpen, onClose, currentFile, onFileChange, onNewFile, markdown, toolbarSettings }) {
    const [files, setFiles] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [images, setImages] = useState([]);
    const [showImages, setShowImages] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showSync, setShowSync] = useState(false);

    // Template presets.
    const templates = {
        note: {
            name: 'Note Template',
            description: 'Simple vertical layout with single column',
            toolbarSettings: {
                columns: 1,
                fontSize: 12,
                padding: 15,
                gap: 5,
                lineHeight: 1.5,
                orientation: 'portrait',
                theme: 'classic',
                fontFamily: 'inter'
            }
        },
        cheatsheet: {
            name: 'Cheatsheet Template',
            description: 'Default cheatsheet layout',
            toolbarSettings: {
                columns: 5,
                fontSize: 8,
                padding: 5,
                gap: 1,
                lineHeight: 1.2,
                orientation: 'landscape',
                theme: 'classic',
                fontFamily: 'inter'
            }
        }
    };

    // Load the file list from localStorage whenever the panel opens.
    useEffect(() => {
        if (!isOpen) return;

        const savedFiles = localStorage.getItem('cheatsheet_files');
        if (savedFiles) {
            try {
                const parsedFiles = JSON.parse(savedFiles);
                // Sort by updated time, newest first.
                const sortedFiles = parsedFiles.sort((a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
                setFiles(sortedFiles);
                console.log('Loaded files:', sortedFiles.map(f => ({ name: f.name, contentLength: f.content.length, updatedAt: f.updatedAt })));
            } catch (e) {
                console.error('Failed to parse saved files:', e);
                setFiles([]);
            }
        } else {
            // Create a default file when nothing has been saved yet.
            const defaultToolbarSettings = {
                columns: 5,
                fontSize: 8,
                padding: 5,
                gap: 1,
                lineHeight: 1.2,
                orientation: 'landscape',
                theme: 'classic',
                fontFamily: 'inter'
            };

            const defaultFile = {
                id: Date.now(),
                name: 'Untitled',
                content: markdown,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                toolbarSettings: defaultToolbarSettings
            };
            setFiles([defaultFile]);
            localStorage.setItem('cheatsheet_files', JSON.stringify([defaultFile]));
        }
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

    // Save the file list to localStorage.
    const saveFiles = (updatedFiles) => {
        setFiles(updatedFiles);
        localStorage.setItem('cheatsheet_files', JSON.stringify(updatedFiles));
    };

    // Create a new file.
    const handleNewFile = () => {
        const newFile = {
            id: Date.now(),
            name: 'Untitled',
            content: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            toolbarSettings: toolbarSettings || {
                columns: 5,
                fontSize: 8,
                padding: 5,
                gap: 1,
                lineHeight: 1.2,
                orientation: 'landscape',
                theme: 'classic',
                fontFamily: 'inter'
            }
        };
        const updatedFiles = [...files, newFile];
        saveFiles(updatedFiles);
        onNewFile(newFile);
    };

    // Create a new file from a template.
    const handleCreateFromTemplate = (templateKey) => {
        const template = templates[templateKey];
        const newFile = {
            id: Date.now(),
            name: `${template.name}`,
            content: '', // Templates do not include content.
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            toolbarSettings: { ...template.toolbarSettings }
        };
        const updatedFiles = [...files, newFile];
        saveFiles(updatedFiles);
        onNewFile(newFile);
        setShowTemplates(false); // Close template selection after creating the file.
    };

    // Delete a file.
    const handleDeleteFile = (fileId) => {
        if (files.length === 1) {
            alert('Cannot delete the last file');
            return;
        }
        if (confirm('Are you sure you want to delete this file?')) {
            const updatedFiles = files.filter(file => file.id !== fileId);
            saveFiles(updatedFiles);

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
    const handleConfirmRename = (fileId) => {
        if (!editingName.trim()) {
            alert('File name cannot be empty');
            return;
        }
        const updatedFiles = files.map(file =>
            file.id === fileId
                ? { ...file, name: editingName.trim() }
                : file
        );
        saveFiles(updatedFiles);
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
        const normalizedFiles = [];

        for (const file of files) {
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
            id: f.id,
            name: f.name,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            toolbarSettings: f.toolbarSettings
        })), null, 2);

        await githubSync.uploadFile(token, owner, repo, 'files.json', indexContent, 'Update file index');

        // 2. Upload each file content and the local image records it references.
        const uploadedImageIds = new Set();
        for (const file of normalizedFiles) {
            const filename = `content/${file.id}.md`;
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

        if (JSON.stringify(normalizedFiles) !== JSON.stringify(files)) {
            saveFiles(normalizedFiles);
        }
    };

    const handlePullFiles = async (token, owner, repo) => {
        // 1. Get index file
        const indexContent = await githubSync.getFileContent(token, owner, repo, 'files.json');
        if (!indexContent) {
            throw new Error('No files found in repository');
        }

        const remoteFiles = JSON.parse(indexContent);
        const mergedFiles = [...files];
        let updatedCount = 0;

        // 2. Merge files
        for (const remoteFile of remoteFiles) {
            const localFileIndex = mergedFiles.findIndex(f => f.id === remoteFile.id);
            const localFile = mergedFiles[localFileIndex];

            // Determine if we should update (if local doesn't exist or remote is newer)
            // For simplicity in "Restore" scenario, we can just overwrite if remote exists
            // But let's check timestamps to be safe, or just overwrite if it's a "Pull" action

            let shouldUpdate = false;
            if (!localFile) {
                shouldUpdate = true;
            } else {
                const remoteDate = new Date(remoteFile.updatedAt);
                const localDate = new Date(localFile.updatedAt);
                if (remoteDate > localDate) {
                    shouldUpdate = true;
                }
            }

            if (shouldUpdate) {
                let content = await githubSync.getFileContent(token, owner, repo, `content/${remoteFile.id}.md`);
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
                        content: content
                    };

                    if (localFileIndex !== -1) {
                        mergedFiles[localFileIndex] = newFile;
                    } else {
                        mergedFiles.push(newFile);
                    }
                    updatedCount++;
                }
            }
        }

        if (updatedCount > 0) {
            // Sort by updated time
            mergedFiles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            saveFiles(mergedFiles);

            // If current file was updated, refresh it
            if (currentFile) {
                const updatedCurrent = mergedFiles.find(f => f.id === currentFile.id);
                if (updatedCurrent && updatedCurrent.updatedAt !== currentFile.updatedAt) {
                    onFileChange(updatedCurrent);
                }
            }

            alert(`Successfully pulled ${updatedCount} files from GitHub.`);
        } else {
            alert('Local files are already up to date.');
        }
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
