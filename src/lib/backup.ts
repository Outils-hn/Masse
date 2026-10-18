// Controle d'un fichier de sauvegarde Masse avant import.

type Row = Record<string, unknown>;
export type Backup = { app?: unknown; materials?: Row[]; elements?: Row[]; components?: Row[]; lists?: Row[]; list_items?: Row[] };

/** Renvoie un message d'erreur lisible si le fichier n'est pas une sauvegarde Masse valide, sinon null. */
export function checkBackup(p: unknown, current: { materials: Row[]; elements: Row[] }): string | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "Ce fichier n'est pas une sauvegarde Masse.";
  const b = p as Backup;
  if (b.app !== "masse") return "Ce fichier ne vient pas de Masse (il manque la signature « masse »).";
  for (const k of ["materials", "elements", "components", "lists", "list_items"] as const) {
    if (b[k] !== undefined && !Array.isArray(b[k])) return `Sauvegarde abîmée : « ${k} » n'est pas une liste.`;
  }
  const bad = (b.materials ?? []).find((m) => !m.id || !String(m.name ?? "").trim() || !["density", "surface", "linear", "unit"].includes(String(m.mode)));
  if (bad) return `Matériau invalide dans le fichier : « ${String(bad.name ?? "sans nom")} » (identifiant, nom ou mode manquant).`;
  const badEl = (b.elements ?? []).find((e) => !e.id || !String(e.name ?? "").trim());
  if (badEl) return "Élément invalide dans le fichier (identifiant ou nom manquant).";
  // Chaque composant doit pointer vers un materiau present dans le fichier ou deja dans la base
  const matIds = new Set([...(b.materials ?? []), ...current.materials].map((m) => String(m.id)));
  const orphan = (b.components ?? []).find((c) => !matIds.has(String(c.material_id)));
  if (orphan) return "Le fichier contient un composant dont le matériau est introuvable : import annulé.";
  const elIds = new Set([...(b.elements ?? []), ...current.elements].map((e) => String(e.id)));
  const orphanLine = (b.list_items ?? []).find((i) => !elIds.has(String(i.element_id)));
  if (orphanLine) return "Le fichier contient une ligne de liste dont l'élément est introuvable : import annulé.";
  return null;
}
