import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { jsPDF as JsPDF } from "jspdf";

// Dans les tests, les polices sont lues sur le disque (pas de serveur pour les servir)
vi.mock("./pdf-fonts", () => ({
  installerPolicesPDF: async (doc: JsPDF) => {
    for (const [file, style] of [["IBMPlexSans-Regular.ttf", "normal"], ["IBMPlexSans-SemiBold.ttf", "bold"]] as const) {
      const data = readFileSync(path.resolve(__dirname, "../assets/fonts", file)).toString("base64");
      doc.addFileToVFS(file, data);
      doc.addFont(file, "PlexSans", style);
    }
    doc.setFont("PlexSans", "normal");
  },
}));

import { jsPDF } from "jspdf";
import { exportElementPdf, exportListPdf } from "./fiche-pdf";
import type { Material } from "./calc";

const mat = (id: string, name: string, mode: Material["mode"], value: number, source = "valeur standard à vérifier"): Material =>
  ({ id, name, category: "metal", mode, value, source, note: "", deleted_at: null, updated_at: "" });

let saved: { name: string; pages: number; size: number }[] = [];
beforeEach(() => {
  saved = [];
  // On intercepte le telechargement : on verifie le document au lieu de le sauver
  vi.spyOn(jsPDF.API, "save").mockImplementation(function (this: JsPDF, name: string) {
    const buf = this.output("arraybuffer");
    saved.push({ name, pages: this.getNumberOfPages(), size: buf.byteLength });
    // En CI, on garde les PDF pour pouvoir les regarder (artefact de la verification)
    if (process.env["CI"]) {
      mkdirSync("test-output", { recursive: true });
      writeFileSync(path.join("test-output", name), Buffer.from(buf));
    }
    return this;
  } as never);
});

describe("fiche PDF", () => {
  it("génère la fiche d'un élément (avec matériau à vérifier)", async () => {
    const mats = new Map([
      ["a", mat("a", "Aluminium", "density", 2700)],
      ["p", mat("p", "Profilé Z 40", "linear", 1.875, "fiche fournisseur 2025")],
    ]);
    await exportElementPdf(
      {
        name: "Panneau / type A", description: "Façade nord, étage 3", length_mm: 1000, height_mm: 1200, markup_pct: 5,
        components: [
          { material_id: "a", thickness_mm: 2, faces: 2, length_m: 0, count: 1, custom_area_m2: null, glass_composition: "" },
          { material_id: "p", thickness_mm: 0, faces: 1, length_m: 1.2, count: 2, custom_area_m2: null, glass_composition: "" },
        ],
      },
      mats,
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe("Fiche poids - Panneau - type A.pdf");
    expect(saved[0]!.pages).toBe(1);
    expect(saved[0]!.size).toBeGreaterThan(5000);
  });

  it("génère une longue liste sur plusieurs pages", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      name: `Élément ${i + 1}`, quantity: 2, unit: 40 + i, area: 1.2, trashed: i === 3, unverified: i === 0 ? ["Aluminium"] : [],
    }));
    await exportListPdf("Livraison étage 3", rows);
    expect(saved[0]!.name).toBe("Poids livraison - Livraison étage 3.pdf");
    expect(saved[0]!.pages).toBeGreaterThan(1);
  });
});
