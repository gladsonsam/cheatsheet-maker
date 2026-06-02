import type { CSSProperties, Dispatch, MutableRefObject, SetStateAction } from 'react';

export type Orientation = 'landscape' | 'portrait';
export type AppTheme = 'dark' | 'light';

export interface ToolbarSettings {
  columns: number;
  fontSize: number;
  padding: number;
  gap: number;
  lineHeight: number;
  orientation: Orientation;
  theme: string;
  fontFamily: string;
}

export interface CheatsheetFile {
  id: number;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  toolbarSettings?: ToolbarSettings;
}

export interface ThemeDefinition {
  name: string;
  description?: string;
  cssVars: Record<string, string>;
  styles: Record<string, CSSProperties & Record<string, string | number | undefined>>;
}

export type ThemeMap = Record<string, ThemeDefinition>;

export interface StoredImage {
  id: string;
  data: string;
  type: string;
  name: string;
  timestamp: number;
}

export interface DisplayImage extends StoredImage {
  url?: string;
  sourceFile?: string;
}

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type PreviewHandle = HTMLDivElement;

export interface EditorHandle {
  scrollToLine: (line: number) => void;
}

export type RefObjectOrNull<T> = MutableRefObject<T | null>;
