import { describe, it, expect } from "vitest";
import { parseNum, glassThickness, inputText, componentWeight, elementResult, type Material } from "./calc";

const alu: Material = { id: "a", name: "Alu", category: "metal", mode: "density", value: 2700, source: "", note: "", deleted_at: null, updated_at: "" };

describe("calc", () => {
  it("parses swiss apostrophe and comma", () => {
    expect(parseNum("1'234,5")).toBe(1234.5);
    expect(parseNum("2.5")).toBe(2.5);
  });
  it("glass 6/16/6 = 12 mm", () => expect(glassThickness("6/16/6")).toBe(12));
  it("glass 44.2 counts PVB", () => expect(glassThickness("44.2")).toBeCloseTo(8.76));
  it("density example: 2 × 1,20 m² × 2 mm × 2700 = 12,96 kg", () => {
    const r = componentWeight({ material_id: "a", thickness_mm: 2, faces: 2, length_m: 0, count: 1, custom_area_m2: null, glass_composition: "" }, alu, { length_mm: 1000, height_mm: 1200 });
    expect(r.kg).toBeCloseTo(12.96);
  });
  it("input text keeps integer zeros (1000 must not become 1)", () => {
    expect(inputText(1000, 0)).toBe("1000");
    expect(inputText(1200, 0)).toBe("1200");
    expect(inputText(10, 0)).toBe("10");
    expect(inputText(12500, 2)).toBe("12500");
    expect(inputText(1.5, 2)).toBe("1,5");
    expect(inputText(0.38, 2)).toBe("0,38");
    expect(inputText(2, 3)).toBe("2");
    expect(inputText(null)).toBe("");
  });
  it("total rounds up with 5 % markup", () => {
    const r = elementResult({ name: "x", description: "", length_mm: 1000, height_mm: 1200, markup_pct: 5, components: [{ material_id: "a", thickness_mm: 2, faces: 2, length_m: 0, count: 1, custom_area_m2: null, glass_composition: "" }] }, new Map([["a", alu]]));
    expect(r.total).toBe(14); // 13.608 -> 14
  });
});
