import { ColorEntry, ColorId } from "./types";

export const COLORS: readonly ColorEntry[] = [
  { id: "yellow", hex: "#fff176", label: "Yellow" },
  { id: "green", hex: "#aed581", label: "Green" },
  { id: "blue", hex: "#4fc3f7", label: "Blue" },
  { id: "orange", hex: "#ff8a65", label: "Orange" },
  { id: "purple", hex: "#ce93d8", label: "Purple" },
  { id: "pink", hex: "#f48fb1", label: "Pink" },
  { id: "teal", hex: "#80cbc4", label: "Teal" },
  { id: "amber", hex: "#ffcc80", label: "Amber" },
];

export const DEFAULT_COLOR: ColorId = "yellow";

export function colorHex(id: ColorId): string {
  return COLORS.find((c) => c.id === id)?.hex || COLORS[0].hex;
}
