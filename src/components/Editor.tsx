import { useRef, useState, forwardRef, useImperativeHandle, useMemo, useDeferredValue, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Eye, Edit3, Columns, Download, Maximize, X, Menu, ImagePlus } from 'lucide-react';
import MonacoEditor from '@monaco-editor/react';
import MermaidDiagram from './MermaidDiagram';
import FormattingToolbar from './FormattingToolbar';
import ImageRenderer from './ImageRenderer';
import Outline from './Outline';
import LazyKatex from './LazyKatex';
import imageStorage from '../utils/imageStorage';
import 'katex/dist/katex.min.css';
import TurndownService from 'turndown';
import './Editor.css';

// Initialize Turndown once for the file
const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});

// Disable Turndown's automatic escaping to prevent unwanted backslashes in formulas or special characters
turndownService.escape = (string) => string;

// Preprocess markdown to handle **text:** patterns
const preprocessMarkdown = (markdown) => {
    // Match **text with punctuation** and add space before closing **
    // Supports: :;,!?.()[]{}\"'<>-–—/\\|@#$%^&*+=~`
    // Both English and Chinese punctuation
    return markdown.replace(/\*\*([^*]+?)([：:;,!?。，；！？\)\]\}\"'》>\\-–—\\/\\\\|@#$%^&*+=~`])\*\*/g, '**$1$2** ');
};

const Editor = forwardRef<any, any>(({ markdown, setMarkdown, appTheme, currentFile }, ref) => {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const previewRef = useRef(null);
    const imageInputRef = useRef(null);
    const [viewMode, setViewMode] = useState('edit'); // 'edit', 'preview', 'split'
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Use deferred value for markdown to prevent blocking the UI during typing
    // This allows the editor to remain responsive even if the preview takes time to render
    const deferredMarkdown = useDeferredValue(markdown);

    // Memoize preprocessed markdown to avoid unnecessary regex operations
    const preprocessedMarkdown = useMemo(() => {
        return preprocessMarkdown(deferredMarkdown);
    }, [deferredMarkdown]);

    useImperativeHandle(ref, () => ({
        scrollToLine: (line) => {
            if (editorRef.current) {
                editorRef.current.revealLineInCenter(line);
                editorRef.current.setPosition({ lineNumber: line, column: 1 });
                editorRef.current.focus();
            }
        }
    }));

    const scrollToMarkdownLine = (line) => {
        if (!previewRef.current || previewRef.current.classList.contains('hidden')) return;

        // Find the closest element with a data-line attribute <= line
        let target = null;
        for (let i = line; i >= 1; i--) {
            target = previewRef.current.querySelector(`[data-line="${i}"]`);
            if (target) break;
        }

        if (target) {
            const container = previewRef.current;
            // Calculate position relative to container to avoid window shaking
            // caused by scrollIntoView() bubbling up
            const targetRect = target.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const relativeTop = targetRect.top - containerRect.top;

            // Scroll to center
            container.scrollTo({
                top: container.scrollTop + relativeTop - container.clientHeight / 2 + targetRect.height / 2,
                behavior: 'smooth'
            });
        }
    };

    const [toolbarVisible, setToolbarVisible] = useState(false);
    const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });

    // Handle image button click
    const handleImageButtonClick = () => {
        imageInputRef.current?.click();
    };

    // Handle file selection
    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            await handleImageUpload(files);
            // Clear input to allow re-selection of the same file
            e.target.value = '';
        }
    };

    const handleFormat = (type) => {
        if (!editorRef.current) return;

        const editor = editorRef.current;
        const selection = editor.getSelection();
        const text = editor.getModel().getValueInRange(selection);

        let newText = text;
        const range = selection;

        switch (type) {
            case 'bold':
                newText = `**${text}**`;
                break;
            case 'italic':
                newText = `*${text}*`;
                break;
            case 'strikethrough':
                newText = `~~${text}~~`;
                break;
            case 'code':
                newText = `\`${text}\``;
                break;
            case 'link':
                newText = `[${text}](url)`;
                break;
            case 'h1':
                newText = `# ${text}`;
                break;
            case 'h2':
                newText = `## ${text}`;
                break;
            case 'h3':
                newText = `### ${text}`;
                break;
            case 'unordered-list':
                newText = text.split('\n').map(line => `- ${line}`).join('\n');
                break;
            case 'ordered-list':
                newText = text.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
                break;
            default:
                return;
        }

        editor.executeEdits('toolbar', [{
            range: range,
            text: newText,
            forceMoveMarkers: true
        }]);

        editor.focus();
        setToolbarVisible(false);
    };

    // Handle image upload
    const handleImageUpload = async (files) => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;

        if (!editor || !monaco || !files || files.length === 0) return;

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                try {
                    // Store the binary locally and keep markdown compact.
                    const imageId = await imageStorage.saveImage(file);

                    // Insert image reference at current cursor position
                    const position = editor.getPosition();
                    const range = new monaco.Range(
                        position.lineNumber,
                        position.column,
                        position.lineNumber,
                        position.column
                    );

                    const imageName = file.name || 'image';
                    const imageMarkdown = `![${imageName}](${imageId})\n`;

                    editor.executeEdits('image-upload', [{
                        range: range,
                        text: imageMarkdown,
                        forceMoveMarkers: true
                    }]);

                    // Update cursor position to after the inserted image
                    const newPosition = {
                        lineNumber: position.lineNumber + 1,
                        column: 1
                    };
                    editor.setPosition(newPosition);
                    editor.focus();
                } catch (error) {
                    console.error('Failed to upload image:', error);
                    alert('Failed to upload image, please try again');
                }
            }
        }
    };

    // Global paste event listener
    useEffect(() => {
        const handlePaste = async (e) => {
            // Only handle if editor has text focus
            const editor = editorRef.current;
            if (!editor || !editor.hasTextFocus()) return;

            const clipboardData = e.clipboardData;
            if (!clipboardData) return;

            // 1. Handle image paste
            const items = clipboardData.items;
            const imageFiles = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }

            if (imageFiles.length > 0) {
                e.preventDefault();
                e.stopImmediatePropagation(); // Completely stop subsequent processing logic
                await handleImageUpload(imageFiles);
                return;
            }

            const selection = editor.getSelection();

            // 2. Try to read Markdown data
            const markdownData = clipboardData.getData('text/markdown') || 
                               clipboardData.getData('text/x-markdown');
            
            if (markdownData && markdownData.trim()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                editor.executeEdits('paste-markdown', [{
                    range: selection,
                    text: markdownData,
                    forceMoveMarkers: true
                }]);
                return;
            }

            // 3. Fallback: Read HTML data and convert to Markdown
            const htmlData = clipboardData.getData('text/html');
            if (htmlData && htmlData.trim()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                try {
                    const convertedMarkdown = turndownService.turndown(htmlData);
                    if (convertedMarkdown && convertedMarkdown.trim()) {
                        editor.executeEdits('paste-html-to-markdown', [{
                            range: selection,
                            text: convertedMarkdown,
                            forceMoveMarkers: true
                        }]);
                        return;
                    }
                } catch (error) {
                    console.error('HTML conversion failed:', error);
                }
            }

            // If no image, MD or successfully converted HTML, do not call preventDefault
            // and let browser/Monaco handle default text/plain logic
        };

        // Use capture phase to ensure we execute first
        window.addEventListener('paste', handlePaste, true);
        return () => {
            window.removeEventListener('paste', handlePaste, true);
        };
    }, []);

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Listen for drag events
        const domNode = editor.getDomNode();
        if (domNode) {
            domNode.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            domNode.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const files = Array.from(e.dataTransfer?.files || []) as File[];
                const imageFiles = files.filter(f => f.type.startsWith('image/'));

                if (imageFiles.length > 0) {
                    await handleImageUpload(imageFiles);
                }
            });
        }

        const updateToolbarPosition = () => {
            const selection = editor.getSelection();
            if (!selection || selection.isEmpty()) {
                setToolbarVisible(false);
                return;
            }

            const position = editor.getScrolledVisiblePosition(selection.getEndPosition());
            const domNode = editor.getDomNode();

            if (position && domNode) {
                const rect = domNode.getBoundingClientRect();
                const toolbarWidth = 320; // Approximate width of toolbar
                const viewportWidth = window.innerWidth;

                let left = rect.left + position.left;
                const top = rect.top + position.top;

                // Adjust horizontal position if toolbar would be clipped
                // Center the toolbar by default
                const centeredLeft = left - toolbarWidth / 2;

                // Check if toolbar would overflow on the left
                if (centeredLeft < 10) {
                    left = toolbarWidth / 2 + 10; // Add padding from edge
                }
                // Check if toolbar would overflow on the right
                else if (centeredLeft + toolbarWidth > viewportWidth - 10) {
                    left = viewportWidth - toolbarWidth / 2 - 10;
                } else {
                    left = centeredLeft + toolbarWidth / 2;
                }

                setToolbarPosition({
                    top: top,
                    left: left
                });
                setToolbarVisible(true);
            }
        };

        editor.onDidChangeCursorSelection((e) => {
            if (e.selection.isEmpty()) {
                setToolbarVisible(false);
            } else if (e.source === 'keyboard') {
                updateToolbarPosition();
            }
        });

        editor.onMouseUp(() => {
            updateToolbarPosition();
        });

        editor.onMouseDown((e) => {
            setToolbarVisible(false);
            // Sync only on double click
            if (e.event.browserEvent.detail === 2 && e.target.position) {
                scrollToMarkdownLine(e.target.position.lineNumber);
            }
        });
    };

    const handlePreviewClick = (e) => {
        if (!editorRef.current) return;

        // Find the closest element with a data-line attribute
        const target = e.target.closest('[data-line]');
        if (target) {
            const line = parseInt(target.getAttribute('data-line'), 10);
            if (!isNaN(line)) {
                editorRef.current.revealLineInCenter(line);
                editorRef.current.setPosition({ lineNumber: line, column: 1 });
                editorRef.current.focus();
            }
        }
    };

    const handleEditorChange = (value) => {
        setMarkdown(value || '');
    };

    // Custom components to inject source line numbers
    // Memoize components to prevent unnecessary re-renders
    const components = useMemo(() => ({
        p: ({ node, ...props }) => <p data-line={node?.position?.start?.line} {...props} />,
        h1: ({ node, ...props }) => <h1 data-line={node?.position?.start?.line} {...props} />,
        h2: ({ node, ...props }) => <h2 data-line={node?.position?.start?.line} {...props} />,
        h3: ({ node, ...props }) => <h3 data-line={node?.position?.start?.line} {...props} />,
        h4: ({ node, ...props }) => <h4 data-line={node?.position?.start?.line} {...props} />,
        h5: ({ node, ...props }) => <h5 data-line={node?.position?.start?.line} {...props} />,
        h6: ({ node, ...props }) => <h6 data-line={node?.position?.start?.line} {...props} />,
        li: ({ node, ...props }) => <li data-line={node?.position?.start?.line} {...props} />,
        blockquote: ({ node, ...props }) => <blockquote data-line={node?.position?.start?.line} {...props} />,
        pre: ({ node, ...props }) => <pre data-line={node?.position?.start?.line} {...props} />,
        table: ({ node, ...props }) => <table data-line={node?.position?.start?.line} {...props} />,
        img: (props) => <ImageRenderer {...props} />,
        code: ({ node, inline, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            // Check if it's a mermaid diagram
            if (!inline && language === 'mermaid') {
                return (
                    <MermaidDiagram
                        chart={String(children).replace(/\n$/, '')}
                        dataLine={node?.position?.start?.line}
                        onRender={undefined}
                    />
                );
            }

            // Default code rendering
            return inline ? (
                <code className={className} {...props}>
                    {children}
                </code>
            ) : (
                <code className={className} {...props}>
                    {children}
                </code>
            );
        },
        div: ({ className, ...props }) => {
            if (className === 'math-display') {
                return <LazyKatex block={true} math={props['data-math']} strategy="visible" onRender={undefined} />;
            }
            return <div className={className} {...props} />;
        },
        span: ({ className, ...props }) => {
            if (className === 'math-inline') {
                return <LazyKatex block={false} math={props['data-math']} strategy="visible" onRender={undefined} />;
            }
            return <span className={className} {...props} />;
        },
    }), []);

    const remarkRehypeOptions = useMemo(() => ({
        handlers: {
            math: (state, node) => {
                return {
                    type: 'element',
                    tagName: 'div',
                    properties: { className: 'math-display', 'data-math': node.value },
                    children: []
                };
            },
            inlineMath: (state, node) => {
                return {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: 'math-inline', 'data-math': node.value },
                    children: []
                };
            }
        }
    }), []);

    const [isOutlineOpen, setIsOutlineOpen] = useState(false);

    // Generate safe file name
    const sanitizeFileName = (fileName) => {
        // Windows/Linux/macOS disallowed characters: \ / : * ? " < > |
        return fileName.replace(/[\\/:*?"<>|]/g, '_');
    };

    return (
        <div className={`editor ${isFullscreen ? 'editor-fullscreen' : ''}`}>
            <FormattingToolbar
                visible={toolbarVisible}
                position={toolbarPosition}
                onFormat={handleFormat}
            />
            {/* Hidden file input for image upload */}
            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
            />
            <div className="editor-header">
                <div className="editor-header-left">
                    <button
                        className="outline-toggle-btn"
                        onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                        title={isOutlineOpen ? "Hide Outline" : "Show Outline"}
                    >
                        {isOutlineOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                    <span className="editor-title">Markdown Editor</span>
                    <span className="editor-info">
                        {markdown.length} chars · {markdown.split('\n').length} lines
                    </span>
                </div>
                <div className="editor-header-right">
                    <button
                        className={`editor-toggle-btn ${viewMode === 'edit' ? 'active' : ''}`}
                        onClick={() => setViewMode('edit')}
                        title="Edit Only"
                    >
                        <Edit3 size={14} />
                    </button>
                    <button
                        className={`editor-toggle-btn ${viewMode === 'split' ? 'active' : ''}`}
                        onClick={() => setViewMode('split')}
                        title="Split View"
                    >
                        <Columns size={14} />
                    </button>
                    <button
                        className={`editor-toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setViewMode('preview')}
                        title="Preview Only"
                    >
                        <Eye size={14} />
                    </button>
                    <button
                        className="editor-toggle-btn"
                        onClick={handleImageButtonClick}
                        title="Upload Image"
                    >
                        <ImagePlus size={14} />
                    </button>
                    <button
                        className="editor-download-btn"
                        onClick={() => {
                            const blob = new Blob([markdown], { type: 'text/markdown' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            // Use current filename if exists, else use default name
                            const fileName = currentFile?.name ? sanitizeFileName(currentFile.name) : 'untitled';
                            // Ensure filename ends with .md
                            const finalFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
                            a.download = finalFileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }}
                        title="Download Markdown"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        className="editor-fullscreen-btn"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    >
                        {isFullscreen ? <X size={14} /> : <Maximize size={14} />}
                    </button>
                </div>
            </div>
            <div className="editor-content">
                {isOutlineOpen && (
                    <div className="outline-panel">
                        <Outline
                            markdown={markdown}
                            onHeadingClick={(lineNumber) => {
                                if (editorRef.current) {
                                    editorRef.current.revealLineInCenter(lineNumber);
                                    editorRef.current.setPosition({ lineNumber, column: 1 });
                                    editorRef.current.focus();
                                }
                            }}
                        />
                    </div>
                )}
                <div className={`editor-pane editor-pane-edit ${viewMode === 'preview' ? 'hidden' : ''} ${viewMode === 'split' ? 'split' : ''}`}>
                    <MonacoEditor
                        height="100%"
                        language="markdown"
                        theme={appTheme === 'dark' ? 'vs-dark' : 'light'}
                        value={markdown}
                        onChange={handleEditorChange}
                        onMount={handleEditorDidMount}
                        options={{
                            minimap: { enabled: false },
                            wordWrap: 'on',
                            fontSize: 14,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            padding: { top: 16, bottom: 16 },
                            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                            // Enable stable input method mode
                            stablePeek: true,

                            acceptSuggestionOnCommitCharacter: false,
                            acceptSuggestionOnEnter: "off",
                            quickSuggestions: false,
                            suggestOnTriggerCharacters: false
                        }}
                    />
                </div>
                <div
                    ref={previewRef}
                    className={`editor-pane editor-pane-preview ${viewMode === 'edit' ? 'hidden' : ''} ${viewMode === 'split' ? 'split' : ''}`}
                    onClick={handlePreviewClick}
                >
                    {viewMode !== 'edit' && (
                        <div className="markdown-body">
                            <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                        remarkRehypeOptions={remarkRehypeOptions as any}
                                components={components}
                            >
                                {preprocessedMarkdown}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

Editor.displayName = 'Editor';

export default Editor;
