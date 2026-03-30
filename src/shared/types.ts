export type ColorId =
  | "yellow"
  | "green"
  | "blue"
  | "orange"
  | "purple"
  | "pink"
  | "teal"
  | "amber";

export interface ColorEntry {
  id: ColorId;
  hex: string;
  label: string;
}

export type HighlightStyle = "underline" | "bold" | "border" | "strikethrough";

export interface Snippet {
  text: string;
  color: ColorId;
  createdAt?: number;
  note?: string;
  styles?: HighlightStyle[];
  sortIndex?: number;
}

export type StoredSnippet = Snippet | string;

export interface PageEntry {
  snippets: StoredSnippet[];
}

export type Scope = "page" | "site";

export interface StorageSchema {
  pages: Record<string, PageEntry>;
  sites: Record<string, PageEntry>;
  defaultColor: ColorId;
  defaultScope: Scope;
  showNotes: boolean;
}

export interface DisplaySnippet extends Snippet {
  _scope: Scope;
  _srcIndex: number;
}

export interface RefreshHighlightsMessage {
  action: "refresh-highlights";
}

export interface ToggleNotesMessage {
  action: "toggle-notes";
  showNotes: boolean;
}

export type ExtensionMessage =
  | RefreshHighlightsMessage
  | ToggleNotesMessage;
