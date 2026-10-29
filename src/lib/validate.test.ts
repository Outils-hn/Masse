import { describe, it, expect } from "vitest";
import { elementProblems, summary, materialProblems, listProblems } from "./validate";
import type { ElementData, Material, Component } from "./calc";

const mat = (id: string, mode: Material["mode"], category = "metal"): Material =>
  ({ id, name: id, category, mode, value: 1000, source: "", note: "", deleted_at: null, updated_at: "" });
const mats = new Map([mat("alu", "density"), mat("verre", "density", "verre"), mat("prof", "linear"), mat("patte", "unit")].map((m) => [m.id, m]));
const comp = (p: Partial<Component>): Component => ({ material_id: "alu", thickness_mm: 3, faces: 1, length_m: 1, count: 1, custom_area_m2: null, glass_composition: "", ...p });
const el = (p: Partial<ElementData> = {}): ElementData => ({ name: "E", description: "", length_mm: 1200, height_mm: 3000, markup_pct: 5, components: [comp({})], ...p });

describe("controle des saisies", () => {
  it("accepte un element correct", () => expect(elementProblems(el(), mats)).toEqual({}));
  it("refuse les dimensions nulles ou negatives", () => {
    const p = elementProblems(el({ length_mm: -1000, height_mm: 0 }), mats);
    expect(Object.keys(p)).toEqual(["length_mm", "height_mm"]);
  });
  it("refuse une majoration de 500 %", () => expect(elementProblems(el({ markup_pct: 500 }), mats)["markup_pct"]).toBeTruthy());
  it("refuse epaisseur negative, 2,5 faces et surface negative", () => {
    const p = elementProblems(el({ components: [comp({ thickness_mm: -3, faces: 2.5, custom_area_m2: -2 })] }), mats);
    expect(Object.keys(p)).toEqual(["c0.thickness_mm", "c0.faces", "c0.custom_area_m2"]);
  });
  it("signale une composition de verre illisible", () => {
    const p = elementProblems(el({ components: [comp({ material_id: "verre", glass_composition: "abc", thickness_mm: 12 })] }), mats);
    expect(p["c0.glass_composition"]).toMatch(/non reconnue/);
  });
  it("controle longueur et nombre des profils et pieces", () => {
    const p = elementProblems(el({ components: [comp({ material_id: "prof", length_m: 0, count: 1.5 }), comp({ material_id: "patte", count: 0 })] }), mats);
    expect(Object.keys(p)).toEqual(["c0.length_m", "c0.count", "c1.count"]);
  });
  it("resume : premier message + nombre d'autres", () => {
    expect(summary({})).toBeNull();
    expect(summary({ a: "Un.", b: "Deux.", c: "Trois." })).toBe("Un. (+ 2 autres champs à corriger)");
  });
  it("materiaux et listes", () => {
    expect(materialProblems({ name: "Alu", value: 0 })).toMatch(/supérieure à 0/);
    expect(materialProblems({ name: "Alu", value: 2700 })).toBeNull();
    expect(listProblems([{ quantity: 2 }, { quantity: 0 }])).toMatch(/^Ligne 2/);
  });
});
