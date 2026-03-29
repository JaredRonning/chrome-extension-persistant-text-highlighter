import { describe, it, expect } from "vitest";
import { COLORS, DEFAULT_COLOR, colorHex } from "../../src/shared/colors";
import type { ColorId } from "../../src/shared/types";

describe("COLORS", () => {
  it("contains 8 colors", () => {
    expect(COLORS).toHaveLength(8);
  });

  it("contains all expected color IDs", () => {
    const ids = COLORS.map((c) => c.id);
    expect(ids).toEqual([
      "yellow",
      "green",
      "blue",
      "orange",
      "purple",
      "pink",
      "teal",
      "amber",
    ]);
  });

  it("has valid hex values", () => {
    for (const c of COLORS) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has non-empty labels", () => {
    for (const c of COLORS) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_COLOR", () => {
  it('is "yellow"', () => {
    expect(DEFAULT_COLOR).toBe("yellow");
  });
});

describe("colorHex", () => {
  it("returns correct hex for each color", () => {
    expect(colorHex("yellow")).toBe("#fff176");
    expect(colorHex("green")).toBe("#aed581");
    expect(colorHex("blue")).toBe("#4fc3f7");
    expect(colorHex("orange")).toBe("#ff8a65");
    expect(colorHex("purple")).toBe("#ce93d8");
    expect(colorHex("pink")).toBe("#f48fb1");
    expect(colorHex("teal")).toBe("#80cbc4");
    expect(colorHex("amber")).toBe("#ffcc80");
  });

  it("returns first color hex as fallback for unknown ID", () => {
    expect(colorHex("nonexistent" as ColorId)).toBe("#fff176");
  });
});
