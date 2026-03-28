import { ColorId, Snippet, StoredSnippet, Scope } from "./types";
import { DEFAULT_COLOR } from "./colors";

export const DEFAULT_SCOPE: Scope = "page";

export function normalizeSnippet(s: StoredSnippet): Snippet {
  if (typeof s === "string") return { text: s, color: DEFAULT_COLOR };
  return s;
}
