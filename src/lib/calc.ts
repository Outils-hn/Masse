export type Mode = "density" | "surface" | "linear" | "unit";

export const MODES: Record<Mode, { label: string; unit: string }> = {
  density: { label: "Densité", unit: "kg/m³" },
  surface: { label: "Surfacique", unit: "kg/m²" },
  linear: { label: "Linéique", unit: "kg/m" },
  unit: { label: "Unitaire", unit: "kg/pièce" },
};

export const CATEGORIES: Record<string, string> = {
  metal: "Métal",
  verre: "Verre",
  isolant: "Isolant",
  panneau: "Panneau",
  profile: "Profilé",
  joint: "Joint / accessoire",
  autre: "Autre",
};

export interface Material {
  id: string;
  name: string;
  category: string;
  mode: Mode;
  value: number;
  source: string;
  note: string;
  /** Fiche technique liee dans Index (identifiant + nom affiche). */
  index_id?: string | null;
  index_name?: string | null;
  deleted_at: string | null;
  updated_at: string;
}

export interface Component {
  material_id: string;
  label?: string;
  thickness_mm: number;
  faces: number;
  length_m: number;
  count: number;
  custom_area_m2: number | null;
  glass_composition: string;
}

export interface ElementData {
  id?: string;
  name: string;
  description: string;
  length_mm: number;
  height_mm: number;
  markup_pct: number;
  components: Component[];
  updated_at?: string;
  deleted_at?: string | null;
}

/** Accepts "1'234,5", "1 234.5", "1234,5". Returns NaN when not a number. */
export function parseNum(input: string | number | null | undefined): number {
  if (typeof input === "number") return input;
  if (input == null) return NaN;
  let s = String(input).trim().replace(/['’\s\u00a0\u202f]/g, "");
  if (s === "") return NaN;
  if (s.includes(",") && s.includes(".")) {
    // last separator is the decimal one
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  return n
    .toLocaleString("fr-CH", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replace(/[\u202f\u00a0]/g, "'");
}

/**
 * Texte affiche dans un champ de saisie : sans separateur de milliers, et sans
 * zeros inutiles APRES la virgule. Les zeros de la partie entiere sont gardes
 * (1000 reste "1000" — l'ancienne version affichait "1").
 */
export function inputText(v: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return "";
  const s = fmt(v, digits).replace(/['’]/g, "");
  return s.includes(",") ? s.replace(/0+$/, "").replace(/,$/, "") : s;
}

export const PVB_LAYER_MM = 0.38;

/**
 * Glass thickness from a composition: "6/16/6" -> 12, "44.2" -> 8.76, "44.2/16/6" -> 14.76.
 * Gas gaps (even positions in a slash list) are ignored; PVB counted at 0.38 mm per layer.
 */
export function glassThickness(comp: string): number {
  const parts = comp.trim().split("/").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return NaN;
  let total = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const p = parts[i]!.replace(",", ".");
    const lam = p.match(/^(\d+)\.(\d+)$/);
    if (lam && lam[1]!.length >= 2 && lam[1]!.length % 2 === 0) {
      const a = lam[1]!, half = a.length / 2;
      total += Number(a.slice(0, half)) + Number(a.slice(half)) + Number(lam[2]) * PVB_LAYER_MM;
    } else {
      const v = Number(p);
      if (!isFinite(v)) return NaN;
      total += v;
    }
  }
  return Math.round(total * 1000) / 1000;
}

/** Un materiau est "non verifie" tant que sa source contient la mention d'origine. */
export const isUnverified = (m?: Material) => !!m && /à vérifier/i.test(m.source);

export function baseArea(el: { length_mm: number; height_mm: number }) {
  return (el.length_mm * el.height_mm) / 1e6;
}

export function componentWeight(
  c: Component,
  m: Material | undefined,
  el: { length_mm: number; height_mm: number },
): { kg: number; formula: string } {
  if (!c.material_id) return { kg: 0, formula: "Choisissez un matériau" };
  if (!m) return { kg: 0, formula: "Matériau introuvable" };
  const area = c.custom_area_m2 ?? baseArea(el);
  const v = Number(m.value);
  switch (m.mode) {
    case "density": {
      const kg = c.faces * area * (c.thickness_mm / 1000) * v;
      return { kg, formula: `${fmt(c.faces, 0)} × ${fmt(area)} m² × ${fmt(c.thickness_mm)} mm × ${fmt(v, 0)} kg/m³ = ${fmt(kg)} kg` };
    }
    case "surface": {
      const kg = c.faces * area * v;
      return { kg, formula: `${fmt(c.faces, 0)} × ${fmt(area)} m² × ${fmt(v)} kg/m² = ${fmt(kg)} kg` };
    }
    case "linear": {
      const kg = c.count * c.length_m * v;
      return { kg, formula: `${fmt(c.count, 0)} × ${fmt(c.length_m)} m × ${fmt(v, 3)} kg/m = ${fmt(kg)} kg` };
    }
    case "unit": {
      const kg = c.count * v;
      return { kg, formula: `${fmt(c.count, 0)} × ${fmt(v, 3)} kg/pièce = ${fmt(kg)} kg` };
    }
  }
}

export function elementResult(el: ElementData, mats: Map<string, Material>) {
  const lines = el.components.map((c) => ({ c, m: mats.get(c.material_id), ...componentWeight(c, mats.get(c.material_id), el) }));
  const subtotal = lines.reduce((s, l) => s + l.kg, 0);
  const markup = (subtotal * el.markup_pct) / 100;
  const exact = subtotal + markup;
  const area = baseArea(el);
  return { lines, subtotal, markup, exact, total: Math.ceil(exact - 1e-9), area, perM2: area > 0 ? exact / area : NaN };
}
