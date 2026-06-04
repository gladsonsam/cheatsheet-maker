import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Editor from './components/Editor';
import Preview from './components/Preview';
import Toolbar from './components/Toolbar';
import FilePanel from './components/FilePanel';
import { useLocalStorage } from './utils/useLocalStorage';
import fileStorage from './utils/fileStorage';
import defaultThemes from './styles/themes';
import type { ToolbarSettings } from './types';
import './App.css';

const defaultMarkdown = `# Markdown Cheatsheet

## Headers
# H1
## H2
### H3
#### H4
##### H5
###### H6

## Emphasis
**Bold** or __Bold__
*Italic* or _Italic_
***Bold Italic***
~~Strikethrough~~

## Lists
### Unordered
- Item 1
- Item 2
  - Sub Item 2a
  - Sub Item 2b

### Ordered
1. First
2. Second
3. Third

### Task List
- [x] Done task
- [ ] Todo task

## Links & Images
[Link Text](https://example.com)
![Image Alt](https://picsum.photos/150/100)

## Code
Inline \`code\` example.

\`\`\`javascript
// Code block
function hello() {
  console.log("Hello World");
}
\`\`\`

## Tables
| Header 1 | Header 2 | Header 3 |
| ------- | ------ | ------- |
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

## Blockquotes
> This is a blockquote.
>
> > Nested blockquote.

## Math (KaTeX)
Inline: $E = mc^2$

Block:
$$
\\oint_C \\vec{B} \\cdot d\\vec{l} = \\mu_0 I_{enc}
$$

## Horizontal Rule
---

## Footnotes
Here is a footnote reference[^1].

[^1]: Here is the footnote.

## Chart

\`\`\`mermaid
pie title Programming Languages Usage
    "JavaScript" : 35
    "Python" : 25
    "Java" : 20
    "C++" : 12
    "Others" : 8
\`\`\`

## HTML Support
<div style="background-color: #e8f4fd; padding: 15px; border-left: 4px solid #2196F3; border-radius: 4px; color: green;">
  <p>This is a <strong>HTML div element</strong> with inline styles.</p>
</div>
`;

function App() {
  const [markdown, setMarkdown] = useState('');
  const [columns, setColumns] = useLocalStorage('cheatsheet_columns', 5);
  const [fontSize, setFontSize] = useLocalStorage('cheatsheet_fontSize', 8);
  const [padding, setPadding] = useLocalStorage('cheatsheet_padding', 5);
  const [gap, setGap] = useLocalStorage('cheatsheet_gap', 1);
  const [lineHeight, setLineHeight] = useLocalStorage('cheatsheet_lineHeight', 1.2);
  const [scale, setScale] = useState(0.6);
  const [orientation, setOrientation] = useLocalStorage('cheatsheet_orientation', 'landscape');
  const [theme, setTheme] = useLocalStorage('cheatsheet_theme', 'classic');
  const [fontFamily, setFontFamily] = useLocalStorage('cheatsheet_fontFamily', 'inter');
  const [appTheme, setAppTheme] = useLocalStorage('cheatsheet_app_theme', 'dark');
  const [splitSize, setSplitSize] = useLocalStorage('cheatsheet_splitSize', 50);
  const [customThemes, setCustomThemes] = useLocalStorage('cheatsheet_custom_themes', {});
  const [liveUpdate, setLiveUpdate] = useState(true);
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);

  const previewRef = useRef(null);
  const previewContainerRef = useRef(null);
  const editorRef = useRef(null);
  const markdownRef = useRef(markdown);

  const allThemes = useMemo(() => ({
    ...defaultThemes,
    ...customThemes
  }), [customThemes]);

  const handleThemeUpdate = (key, newTheme) => {
    setCustomThemes(prev => ({
      ...prev,
      [key]: newTheme
    }));
    // If the key is new (custom theme), we might want to switch to it
    if (key !== theme) {
      setTheme(key);
    }
  };

  // Keep the latest markdown available to deferred save handlers.
  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  // Apply app theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme);
  }, [appTheme]);

  const defaultValues = {
    columns: 5,
    fontSize: 8,
    padding: 5,
    gap: 1,
    lineHeight: 1.2,
    orientation: 'landscape',
    theme: 'classic',
    fontFamily: 'inter',
    appTheme: 'dark'
  };

  const getToolbarSettings = (): ToolbarSettings => ({
    columns,
    fontSize,
    padding,
    gap,
    lineHeight,
    orientation: orientation as ToolbarSettings['orientation'],
    theme,
    fontFamily
  });

  // Initialize the current file from the active storage backend.
  useEffect(() => {
    let cancelled = false;

    const initializeFiles = async () => {
      try {
        const savedFiles = await fileStorage.loadFiles();
        if (cancelled) return;

        if (savedFiles.length > 0) {
          setCurrentFile(savedFiles[0]);
          setMarkdown(savedFiles[0].content);

          // Load toolbar settings from the current file if they exist
          if (savedFiles[0].toolbarSettings) {
            const settings = savedFiles[0].toolbarSettings;
            if (settings.columns !== undefined) setColumns(settings.columns);
            if (settings.fontSize !== undefined) setFontSize(settings.fontSize);
            if (settings.padding !== undefined) setPadding(settings.padding);
            if (settings.gap !== undefined) setGap(settings.gap);
            if (settings.lineHeight !== undefined) setLineHeight(settings.lineHeight);
            if (settings.orientation !== undefined) setOrientation(settings.orientation);
            if (settings.theme !== undefined) setTheme(settings.theme);
            if (settings.fontFamily !== undefined) setFontFamily(settings.fontFamily);
          }
          return;
        }
      } catch (e) {
        console.error('Failed to load saved files:', e);
      }

      const defaultFile = await fileStorage.createFile('Untitled', defaultMarkdown, getToolbarSettings());
      if (cancelled) return;
      setCurrentFile(defaultFile);
      setMarkdown(defaultMarkdown);
    };

    initializeFiles();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the latest current file available to the disk-change listener.
  const currentFileRef = useRef(currentFile);
  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);

  // Live reload: when files change on disk (e.g. edited by Claude Code or any
  // external editor), refresh the open file so the preview updates instantly.
  const reloadFromDisk = useCallback(async () => {
    const active = currentFileRef.current;
    try {
      const files = await fileStorage.loadFiles();
      if (!active) return;

      const match = files.find(f => f.id === active.id);
      if (match) {
        // Only react to genuine external changes. If the disk content already
        // matches the editor (e.g. this event came from our own autosave), do
        // nothing — touching state here would re-arm autosave and loop.
        if (match.content !== markdownRef.current) {
          setMarkdown(match.content);
          setCurrentFile(prev => (prev ? { ...prev, updatedAt: match.updatedAt } : match));
        }
      } else if (files.length > 0) {
        // The active file was renamed or deleted externally; fall back to the
        // most recently updated file.
        setCurrentFile(files[0]);
        setMarkdown(files[0].content);
      }
    } catch (e) {
      console.error('Failed to reload files from disk:', e);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = fileStorage.subscribeToChanges(() => {
      // Debounce bursts of filesystem events into a single reload.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => reloadFromDisk(), 200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [reloadFromDisk]);

  // Keep settings ref updated for save operations
  const settingsRef = useRef<ToolbarSettings>(getToolbarSettings());

  useEffect(() => {
    settingsRef.current = getToolbarSettings();
  }, [columns, fontSize, padding, gap, lineHeight, orientation, theme, fontFamily]);

  // Save only the current file (single-file write) so that external edits to
  // other files are never overwritten by autosave.
  const saveCurrentFile = async () => {
    if (!currentFile) return;

    try {
      await fileStorage.saveFile({
        ...currentFile,
        content: markdownRef.current,
        updatedAt: new Date().toISOString(),
        toolbarSettings: { ...settingsRef.current }
      });
    } catch (e) {
      console.error('Failed to save current file:', e);
    }
  };

  // Centralized autosave effect.
  useEffect(() => {
    if (!currentFile) return;

    // Debounce saves so related content and toolbar changes are batched together.
    const timer = setTimeout(() => {
      saveCurrentFile();
    }, 2500);

    return () => clearTimeout(timer);
  }, [markdown, currentFile, columns, fontSize, padding, gap, lineHeight, orientation, theme, fontFamily]);

  // Apply a file's saved toolbar settings to the active controls.
  const applyFileSettings = (file) => {
    if (!file?.toolbarSettings) return;
    const settings = file.toolbarSettings;
    if (settings.columns !== undefined) setColumns(settings.columns);
    if (settings.fontSize !== undefined) setFontSize(settings.fontSize);
    if (settings.padding !== undefined) setPadding(settings.padding);
    if (settings.gap !== undefined) setGap(settings.gap);
    if (settings.lineHeight !== undefined) setLineHeight(settings.lineHeight);
    if (settings.orientation !== undefined) setOrientation(settings.orientation);
    if (settings.theme !== undefined) setTheme(settings.theme);
    if (settings.fontFamily !== undefined) setFontFamily(settings.fontFamily);
  };

  // Handle switching between files.
  const handleFileChange = async (file) => {
    // Save the current file before switching.
    await saveCurrentFile();
    // Switch to the selected file.
    setCurrentFile(file);
    setMarkdown(file.content);
    applyFileSettings(file);
    setIsFilePanelOpen(false);
  };

  // Handle creating a new file.
  const handleNewFile = async (file) => {
    // Save the current file before switching.
    await saveCurrentFile();
    // Switch to the new file.
    setCurrentFile(file);
    setMarkdown(file.content);
    applyFileSettings(file);
    setIsFilePanelOpen(false);
  };

  // Adopt an already-persisted replacement for the active file (e.g. after a
  // rename, where the id has changed). No save — the content is already on disk.
  const handleActiveFileReplaced = (file) => {
    setCurrentFile(file);
    setMarkdown(file.content);
    applyFileSettings(file);
  };

  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        setScale(prev => Math.min(Math.max(prev + delta, 0.5), 3));
      }
    };

    const container = previewContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  const handleLineClick = useCallback((line) => {
    editorRef.current?.scrollToLine(line);
  }, []);

  return (
    <div className="app">
      <Toolbar
        columns={columns}
        setColumns={setColumns}
        fontSize={fontSize}
        setFontSize={setFontSize}
        padding={padding}
        setPadding={setPadding}
        gap={gap}
        setGap={setGap}
        lineHeight={lineHeight}
        setLineHeight={setLineHeight}
        scale={scale}
        setScale={setScale}
        orientation={orientation}
        setOrientation={setOrientation}
        theme={theme}
        setTheme={setTheme}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        appTheme={appTheme}
        setAppTheme={setAppTheme}
        previewRef={previewRef}
        onFileClick={() => setIsFilePanelOpen(true)}
        defaultColumns={defaultValues.columns}
        defaultFontSize={defaultValues.fontSize}
        defaultPadding={defaultValues.padding}
        defaultGap={defaultValues.gap}
        defaultLineHeight={defaultValues.lineHeight}
        defaultOrientation={defaultValues.orientation}
        defaultTheme={defaultValues.theme}
        defaultFontFamily={defaultValues.fontFamily}
        defaultAppTheme={defaultValues.appTheme}
        currentFile={currentFile} // Pass currentFile to Toolbar
        themes={allThemes}
        onThemeUpdate={handleThemeUpdate}
      />
      <FilePanel
        isOpen={isFilePanelOpen}
        onClose={() => setIsFilePanelOpen(false)}
        currentFile={currentFile}
        onFileChange={handleFileChange}
        onNewFile={handleNewFile}
        onActiveFileReplaced={handleActiveFileReplaced}
        markdown={markdown}
        toolbarSettings={{
          columns,
          fontSize,
          padding,
          gap,
          lineHeight,
          orientation,
          theme,
          fontFamily
        }}
      />
      <div className="main-content">
        <div className="editor-panel" style={{ width: `${splitSize}%` }}>
          <Editor
            key={currentFile?.id}
            ref={editorRef}
            markdown={markdown}
            setMarkdown={setMarkdown}
            appTheme={appTheme}
            currentFile={currentFile}
          />
        </div>
        <div
          className="resize-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startSize = splitSize;

            const handleMouseMove = (e) => {
              const delta = ((e.clientX - startX) / window.innerWidth) * 100;
              const newSize = Math.min(Math.max(startSize + delta, 20), 80);
              setSplitSize(newSize);
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="resize-handle-bar"></div>
        </div>
        <div
          className="preview-panel"
          style={{ width: `${100 - splitSize}%` }}
          ref={previewContainerRef}
        >
          <Preview
            key={currentFile?.id} // Add key to force re-render when file changes
            ref={previewRef}
            markdown={markdown}
            columns={columns}
            fontSize={fontSize}
            padding={padding}
            gap={gap}
            lineHeight={lineHeight}
            scale={scale}
            setScale={setScale}
            orientation={orientation}
            theme={theme}
            themes={allThemes}
            fontFamily={fontFamily}
            onLineClick={handleLineClick}
            liveUpdate={liveUpdate}
            setLiveUpdate={setLiveUpdate}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
