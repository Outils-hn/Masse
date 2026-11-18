import { describe, it, expect } from "vitest";
import { detailElement, detailListe } from "./detail";

describe("copier le détail", () => {
  const d = detailElement({
    nom: "Module Haut", dims: "3675 x 345",
    lignes: [{ nom: "Acier", mode: "Densité", calcul: "1 × 1,27 m² × 3,00 mm × 7'850 kg/m³ = 29,91 kg", kg: "29,91", part: "66,8" }],
    sousTotal: "44,74", majLabel: "Majoration 5 %", maj: "2,24", total: "47", parM2: "37,05",
  });
  it("texte : une ligne par composant, sans tabulations", () => {
    expect(d.texte).not.toContain("\t");
    expect(d.texte).toContain("Acier : 1 × 1,27 m² × 3,00 mm × 7'850 kg/m³ = 29,91 kg (66,8 %)");
    expect(d.texte).toContain("Poids total (arrondi) : 47 kg");
    expect(d.texte).toContain("Poids au m² : 37,05 kg/m²");
  });
  it("html : tableau, nombres sans apostrophe, texte échappé", () => {
    expect(d.html).toContain("<table");
    expect(d.html).toContain('<td align="right">29,91</td>');
    const e = detailElement({ ...{ nom: "A<B & C", dims: "1 x 1", lignes: [], sousTotal: "1'000,00", majLabel: "M", maj: "0", total: "1", parM2: "1" } });
    expect(e.html).toContain("A&lt;B &amp; C");
    expect(e.html).toContain('<td align="right">1000,00</td>');
  });
  it("liste : texte lisible et pluriel", () => {
    const l = detailListe({ nom: "L1", lignes: [{ nom: "Module", qte: 2, unitaire: "47,00", surface: "1,268", total: "94,00" }], totQte: 2, totSurface: "2,536", totPoids: "94,00", moyen: "37,1" });
    expect(l.texte).toContain("Module : 2 × 47,00 kg = 94,00 kg (1,268 m² par pièce)");
    expect(l.texte).toContain("Total : 2 pièces, 94,00 kg, 2,536 m²");
    expect(l.texte).not.toContain("\t");
  });
});
