// « Copier le détail » : deux versions du meme contenu dans le presse-papiers.
//  - texte : lisible partout (AutoCAD, mail, bloc-notes), une ligne par composant, sans colonnes a aligner ;
//  - tableau HTML : Excel et Word le collent en vraies cellules (les nombres restent des nombres).
export type Tableau = { texte: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sansApostrophe = (s: string) => s.replace(/'/g, "");

type LigneComposant = { nom: string; mode: string; calcul: string; kg: string; part: string };
export type DetailElement = { nom: string; dims: string; lignes: LigneComposant[]; sousTotal: string; majLabel: string; maj: string; total: string; parM2: string };

export function detailElement(d: DetailElement): Tableau {
  const texte = [
    `Élément : ${d.nom}`,
    `Dimensions : ${d.dims} mm`,
    "",
    ...d.lignes.map((l) => `${l.nom} : ${l.calcul} (${l.part} %)`),
    "",
    `Sous-total : ${d.sousTotal} kg`,
    `${d.majLabel} : ${d.maj} kg`,
    `Poids total (arrondi) : ${d.total} kg`,
    `Poids au m² : ${d.parM2} kg/m²`,
  ].join("\n");
  const td = (s: string, droite = false) => `<td${droite ? ' align="right"' : ""}>${esc(s)}</td>`;
  const tr = (...c: string[]) => `<tr>${c.join("")}</tr>`;
  const html = `<table border="1" cellspacing="0" cellpadding="3">`
    + tr(td("Élément"), td(d.nom)) + tr(td("Dimensions (mm)"), td(d.dims))
    + tr(...["Composant", "Mode", "Calcul", "Poids (kg)", "Part (%)"].map((h) => `<th>${h}</th>`))
    + d.lignes.map((l) => tr(td(l.nom), td(l.mode), td(l.calcul), td(sansApostrophe(l.kg), true), td(l.part, true))).join("")
    + tr(td("Sous-total"), td(""), td(""), td(sansApostrophe(d.sousTotal), true))
    + tr(td(d.majLabel), td(""), td(""), td(sansApostrophe(d.maj), true))
    + tr(td("Poids total (arrondi)"), td(""), td(""), td(d.total, true))
    + tr(td("Poids au m²"), td(""), td(""), td(sansApostrophe(d.parM2), true))
    + "</table>";
  return { texte, html };
}

type LigneListe = { nom: string; qte: number; unitaire: string; surface: string; total: string };
export type DetailListe = { nom: string; lignes: LigneListe[]; totQte: number; totSurface: string; totPoids: string; moyen: string };

export function detailListe(d: DetailListe): Tableau {
  const texte = [
    `Liste : ${d.nom}`,
    "",
    ...d.lignes.map((l) => `${l.nom} : ${l.qte} × ${l.unitaire} kg = ${l.total} kg (${l.surface} m² par pièce)`),
    "",
    `Total : ${d.totQte} pièce${d.totQte > 1 ? "s" : ""}, ${d.totPoids} kg, ${d.totSurface} m²`,
    `Poids moyen : ${d.moyen} kg/m²`,
  ].join("\n");
  const td = (s: string | number, droite = false) => `<td${droite ? ' align="right"' : ""}>${esc(String(s))}</td>`;
  const tr = (...c: string[]) => `<tr>${c.join("")}</tr>`;
  const html = `<table border="1" cellspacing="0" cellpadding="3">`
    + tr(td("Liste"), td(d.nom))
    + tr(...["Élément", "Quantité", "Poids unitaire (kg)", "Surface unitaire (m²)", "Poids total (kg)"].map((h) => `<th>${h}</th>`))
    + d.lignes.map((l) => tr(td(l.nom), td(l.qte, true), td(sansApostrophe(l.unitaire), true), td(sansApostrophe(l.surface), true), td(sansApostrophe(l.total), true))).join("")
    + tr(td("Total"), td(d.totQte, true), td(""), td(sansApostrophe(d.totSurface), true), td(sansApostrophe(d.totPoids), true))
    + tr(td("Poids moyen (kg/m²)"), td(sansApostrophe(d.moyen), true))
    + "</table>";
  return { texte, html };
}
