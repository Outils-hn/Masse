import { describe, it, expect } from "vitest";
import { checkBackup } from "./backup";

const empty = { materials: [], elements: [] };
const mat = { id: "m1", name: "Alu", mode: "density" };

describe("checkBackup", () => {
  it("rejects files that are not Masse backups", () => {
    expect(checkBackup(null, empty)).toMatch(/pas une sauvegarde/);
    expect(checkBackup([], empty)).toMatch(/pas une sauvegarde/);
    expect(checkBackup({ materials: [] }, empty)).toMatch(/ne vient pas de Masse/);
  });
  it("accepts a valid backup", () => {
    expect(checkBackup({ app: "masse", materials: [mat], elements: [{ id: "e1", name: "P" }], components: [{ element_id: "e1", material_id: "m1" }] }, empty)).toBeNull();
  });
  it("rejects a material without mode", () => {
    expect(checkBackup({ app: "masse", materials: [{ id: "m2", name: "Z" }] }, empty)).toMatch(/Matériau invalide/);
  });
  it("rejects a component whose material is nowhere", () => {
    expect(checkBackup({ app: "masse", components: [{ element_id: "e1", material_id: "x" }] }, empty)).toMatch(/matériau est introuvable/);
  });
  it("accepts a component whose material already exists in the database", () => {
    expect(checkBackup({ app: "masse", components: [{ element_id: "e1", material_id: "m1" }] }, { materials: [mat], elements: [] })).toBeNull();
  });
  it("rejects a list line whose element is nowhere", () => {
    expect(checkBackup({ app: "masse", list_items: [{ list_id: "l1", element_id: "nope" }] }, empty)).toMatch(/élément est introuvable/);
  });
});
