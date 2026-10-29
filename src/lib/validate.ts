import { glassThickness, type ElementData, type Material } from "./calc";

/**
 * Controle des saisies d'un element avant enregistrement : une valeur absurde
 * (largeur negative, epaisseur nulle, 2,5 faces...) donnerait un poids faux sans le dire.
 * Retourne les messages par champ (cle « length_mm », « c0.thickness_mm »...), dans l'ordre de l'ecran.
 */
export type Problems = Record<string, string>;

const isInt = (n: number) => Number.isInteger(n);
export const MAX_DIM_MM = 30000;

export function elementProblems(el: ElementData, mats: Map<string, Material>): Problems {
  const p: Problems = {};
  if (!el.name.trim()) p["name"] = "Donnez un nom à l'élément.";
  if (!(el.length_mm > 0)) p["length_mm"] = "La largeur doit être supérieure à 0.";
  else if (el.length_mm > MAX_DIM_MM) p["length_mm"] = "Largeur supérieure à 30 m : vérifiez l'unité (mm).";
  if (!(el.height_mm > 0)) p["height_mm"] = "La hauteur doit être supérieure à 0.";
  else if (el.height_mm > MAX_DIM_MM) p["height_mm"] = "Hauteur supérieure à 30 m : vérifiez l'unité (mm).";
  if (!(el.markup_pct >= 0 && el.markup_pct <= 100)) p["markup_pct"] = "La majoration doit être comprise entre 0 et 100 %.";
  el.components.forEach((c, i) => {
    const k = (f: string) => `c${i}.${f}`;
    const m = mats.get(c.material_id);
    if (!c.material_id) { p[k("material_id")] = `Composant ${i + 1} : choisissez un matériau.`; return; }
    if (!m) return;
    if (m.mode === "density") {
      if (m.category === "verre" && c.glass_composition.trim() && isNaN(glassThickness(c.glass_composition)))
        p[k("glass_composition")] = `Composant ${i + 1} : composition de verre non reconnue (ex. 6/16/6 ou 44.2/16/6).`;
      if (!(c.thickness_mm > 0)) p[k("thickness_mm")] = `Composant ${i + 1} : l'épaisseur doit être supérieure à 0.`;
    }
    if (m.mode === "density" || m.mode === "surface") {
      if (!(c.faces >= 1 && isInt(c.faces))) p[k("faces")] = `Composant ${i + 1} : le nombre de faces doit être un entier (1, 2…).`;
      if (c.custom_area_m2 != null && !(c.custom_area_m2 > 0)) p[k("custom_area_m2")] = `Composant ${i + 1} : la surface doit être supérieure à 0 (ou laissez vide).`;
    }
    if (m.mode === "linear" && !(c.length_m > 0)) p[k("length_m")] = `Composant ${i + 1} : la longueur doit être supérieure à 0.`;
    if ((m.mode === "linear" || m.mode === "unit") && !(c.count >= 1 && isInt(c.count)))
      p[k("count")] = `Composant ${i + 1} : le nombre doit être un entier (1, 2…).`;
  });
  return p;
}

/** Message unique pour la notification : le premier probleme, plus le nombre d'autres. */
export function summary(p: Problems): string | null {
  const msgs = Object.values(p);
  if (!msgs.length) return null;
  return msgs.length === 1 ? msgs[0]! : `${msgs[0]} (+ ${msgs.length - 1} autre${msgs.length > 2 ? "s" : ""} champ${msgs.length > 2 ? "s" : ""} à corriger)`;
}

export function materialProblems(m: { name: string; value: number }): string | null {
  if (!m.name.trim()) return "Donnez un nom au matériau.";
  if (!(m.value > 0)) return "La valeur du matériau doit être supérieure à 0.";
  return null;
}

export function listProblems(items: { quantity: number }[]): string | null {
  const i = items.findIndex((it) => !(it.quantity >= 1 && Number.isInteger(it.quantity)));
  return i < 0 ? null : `Ligne ${i + 1} : la quantité doit être un entier (1, 2…).`;
}
