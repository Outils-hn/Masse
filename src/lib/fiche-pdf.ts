import type { jsPDF } from "jspdf";
import { elementResult, fmt, isUnverified, MODES, type ElementData, type Material } from "./calc";
import { installerPolicesPDF } from "./pdf-fonts";

// Fiches poids en PDF, telechargees directement (meme principe que Linear) :
// jsPDF dessine la page, jspdf-autotable les tableaux, police IBM Plex embarquee.
// Les librairies sont chargees a la demande pour ne pas alourdir l'ouverture de l'appli.

type RGB = [number, number, number];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const BRICK: RGB = [154, 74, 58];
const RED: RGB = [180, 35, 24];
const SOFT: RGB = [248, 245, 243];
const SEG: RGB[] = [[154, 74, 58], [63, 107, 92], [192, 138, 62], [91, 107, 140], [140, 91, 122], [30, 41, 59], [122, 140, 91]];

const M = 14; // marge (mm)

/** Sortie du PDF : telechargement dans l'appli, remplacable dans les tests. */
export const pdfSink = { save: (doc: jsPDF, name: string) => void doc.save(name) };
const today = () => new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim() || "sans nom";

async function newDoc() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await installerPolicesPDF(doc);
  return { doc, autoTable };
}

const W = (doc: jsPDF) => doc.internal.pageSize.getWidth();

function header(doc: jsPDF, kind: string, title: string, description?: string) {
  const w = W(doc);
  doc.setFont("PlexSans", "bold").setFontSize(16).setTextColor(...INK).text("Masse", M, M + 4);
  doc.setTextColor(...BRICK).text(".", M + doc.getTextWidth("Masse"), M + 4);
  doc.setFont("PlexSans", "normal").setFontSize(8).setTextColor(...MUTED)
    .text(`${kind.toUpperCase()} · ${today()}`, w - M, M + 4, { align: "right" });
  doc.setDrawColor(...BRICK).setLineWidth(0.6).line(M, M + 7, w - M, M + 7);
  doc.setFont("PlexSans", "bold").setFontSize(17).setTextColor(...INK).text(title, M, M + 18);
  let y = M + 18;
  if (description) {
    doc.setFont("PlexSans", "normal").setFontSize(9.5).setTextColor(...MUTED);
    const lines = doc.splitTextToSize(description, w - 2 * M) as string[];
    doc.text(lines, M, y + 6);
    y += 6 + (lines.length - 1) * 4.5;
  }
  return y + 4;
}

/** Ligne de petits libelles (DIMENSIONS, SURFACE...) avec leur valeur dessous. */
function facts(doc: jsPDF, y: number, items: [string, string][]) {
  let x = M;
  for (const [label, value] of items) {
    doc.setFont("PlexSans", "normal").setFontSize(7).setTextColor(...MUTED).text(label.toUpperCase(), x, y + 4);
    doc.setFontSize(10).setTextColor(...INK).text(value, x, y + 9);
    x += Math.max(doc.getTextWidth(value), 28) + 10;
  }
  return y + 13;
}

/** Deux grands cadres cote a cote (poids total, poids au m2...). */
function bigBoxes(doc: jsPDF, y: number, boxes: [string, string, string][]) {
  const w = W(doc);
  const gap = 5;
  const bw = (w - 2 * M - gap) / 2;
  boxes.forEach(([label, value, unit], i) => {
    const x = M + i * (bw + gap);
    doc.setFillColor(...SOFT).setDrawColor(...LINE).setLineWidth(0.3).roundedRect(x, y, bw, 22, 2, 2, "FD");
    doc.setFont("PlexSans", "normal").setFontSize(7).setTextColor(...MUTED).text(label.toUpperCase(), x + 4, y + 6);
    doc.setFont("PlexSans", "bold").setFontSize(22).setTextColor(...INK).text(value, x + 4, y + 17);
    const valueWidth = doc.getTextWidth(value); // mesure faite en gras 22 pt
    doc.setFont("PlexSans", "normal").setFontSize(9).text(unit, x + 4 + valueWidth + 1.5, y + 17);
  });
  return y + 27;
}

/** Encadre rouge des materiaux non verifies, mention d'estimation et pied de page. */
function closing(doc: jsPDF, y: number, unverified: string[]) {
  const w = W(doc);
  const h = doc.internal.pageSize.getHeight();
  const need = (unverified.length ? 18 : 0) + 22;
  if (y + need > h - M) { doc.addPage(); y = M; }
  if (unverified.length) {
    doc.setFont("PlexSans", "normal").setFontSize(8.5);
    const txt = `Valeurs non vérifiées : ${unverified.join(", ")}. Ces matériaux utilisent encore une valeur standard : à confirmer avant de transmettre ce poids.`;
    const lines = doc.splitTextToSize(txt, w - 2 * M - 8) as string[];
    const bh = 5 + lines.length * 4;
    doc.setDrawColor(...RED).setLineWidth(0.3).roundedRect(M, y, w - 2 * M, bh, 1.5, 1.5, "S");
    doc.setTextColor(...RED).text(lines, M + 4, y + 5.5);
    y += bh + 5;
  }
  doc.setFont("PlexSans", "normal").setFontSize(8.5).setTextColor(...MUTED)
    .text("Estimation — ne remplace pas un calcul de levage ou de transport.", M, y + 3);
  // Pied de page sur chaque page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, h - M - 4, w - M, h - M - 4);
    doc.setFontSize(7.5).setTextColor(148, 163, 184).text(`Établi par H. N. · Masse · ${today()}`, M, h - M);
    if (pages > 1) doc.text(`${p} / ${pages}`, w - M, h - M, { align: "right" });
  }
}

/** Trace le trait du total sur la bonne page, par-dessus le tableau deja dessine. */
function drawTotalLine(doc: jsPDF, at: { page: number; y: number } | null) {
  if (!at) return;
  const current = doc.getCurrentPageInfo().pageNumber;
  doc.setPage(at.page);
  doc.setDrawColor(...INK).setLineWidth(0.4).line(M, at.y, W(doc) - M, at.y);
  doc.setPage(current);
}

const tableStyles = {
  styles: { font: "PlexSans", fontSize: 9, textColor: INK, cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 }, lineColor: LINE, lineWidth: 0 },
  headStyles: { font: "PlexSans", fontStyle: "normal" as const, fontSize: 7, textColor: MUTED, fillColor: [255, 255, 255] as RGB },
  footStyles: { font: "PlexSans", fontStyle: "normal" as const, textColor: [71, 85, 105] as RGB, fillColor: [255, 255, 255] as RGB },
  alternateRowStyles: { fillColor: [250, 250, 251] as RGB },
};

export async function exportElementPdf(el: ElementData, mats: Map<string, Material>) {
  const { doc, autoTable } = await newDoc();
  const res = elementResult(el, mats);
  const unverified = [...new Set(res.lines.filter((l) => isUnverified(l.m)).map((l) => l.m!.name))];
  const w = W(doc);

  let y = header(doc, "Fiche poids", el.name, el.description);
  y = facts(doc, y, [
    ["Dimensions", `${fmt(el.length_mm, 0)} × ${fmt(el.height_mm, 0)} mm`],
    ["Surface", `${fmt(res.area, 3)} m²`],
    ["Majoration", `${fmt(el.markup_pct, 1)} %`],
  ]);
  y = bigBoxes(doc, y, [
    ["Poids total", String(res.total), "kg"],
    ["Poids au m²", fmt(res.perM2, 1), "kg/m²"],
  ]);

  // Barre de repartition par composant
  if (res.subtotal > 0) {
    let x = M;
    res.lines.forEach((l, i) => {
      const sw = ((w - 2 * M) * l.kg) / res.subtotal;
      doc.setFillColor(...SEG[i % SEG.length]!).rect(x, y, sw, 2.5, "F");
      x += sw;
    });
    y += 6;
  }

  // Trait au-dessus du total : position memorisee pendant le dessin du tableau,
  // puis trace a la fin (sinon le fond des cellules voisines le recouvre en partie)
  let totalLine: { page: number; y: number } | null = null;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    margin: { left: M, right: M, bottom: M + 8 },
    head: [["", "COMPOSANT", "CALCUL", "POIDS (KG)", "PART"]],
    body: res.lines.map((l) => [
      "",
      // 2e ligne : mode de calcul (+ mention "a verifier", recoloree au dessin)
      `${l.m?.name ?? "?"}\n${l.m ? MODES[l.m.mode].label : ""}${isUnverified(l.m) ? " · à vérifier" : ""}`,
      l.formula,
      fmt(l.kg),
      `${fmt(res.subtotal ? (l.kg / res.subtotal) * 100 : 0, 1)} %`,
    ]),
    foot: [
      ["", { content: "Sous-total sans majoration", colSpan: 2 }, fmt(res.subtotal), ""],
      ["", { content: `Majoration ${fmt(el.markup_pct, 1)} %`, colSpan: 2 }, fmt(res.markup), ""],
      ["", { content: "Poids total (arrondi au kg supérieur)", colSpan: 2 }, String(res.total), ""],
    ],
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    columnStyles: {
      0: { cellWidth: 6 },
      1: { cellWidth: 46 },
      2: { fontSize: 7.5, textColor: [71, 85, 105] },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 18, halign: "right" },
    },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index >= 3) d.cell.styles.halign = "right";
      if (d.section === "foot" && d.row.index === 2) { d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = INK; }
      if (d.section === "foot" && d.column.index === 3) d.cell.styles.halign = "right";
    },
    willDrawCell: (d) => {
      // Colonne composant : on dessine nous-memes pour colorer la 2e ligne
      if (d.section === "body" && d.column.index === 1) d.cell.text = [];
    },
    didDrawCell: (d) => {
      const line = res.lines[d.row.index];
      if (d.section === "body" && d.column.index === 0) {
        doc.setFillColor(...SEG[d.row.index % SEG.length]!).roundedRect(d.cell.x + 1.5, d.cell.y + 2.6, 2.6, 2.6, 0.5, 0.5, "F");
      }
      if (d.section === "body" && d.column.index === 1 && line) {
        const x = d.cell.x + 1.5;
        doc.setFont("PlexSans", "normal").setFontSize(9).setTextColor(...INK).text(line.m?.name ?? "?", x, d.cell.y + 5);
        const mode = line.m ? MODES[line.m.mode].label : "";
        doc.setFontSize(7).setTextColor(...MUTED).text(mode, x, d.cell.y + 9);
        if (isUnverified(line.m)) doc.setTextColor(...RED).text(" · à vérifier", x + doc.getTextWidth(mode), d.cell.y + 9);
      }
      if (d.section === "foot" && d.row.index === 2 && d.column.index === 0) {
        totalLine = { page: doc.getCurrentPageInfo().pageNumber, y: d.cell.y };
      }
    },
  });

  drawTotalLine(doc, totalLine);
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  closing(doc, endY + 6, unverified);
  pdfSink.save(doc, `Fiche poids - ${safeName(el.name)}.pdf`);
}

export interface ListPdfRow {
  name: string;
  quantity: number;
  unit: number;
  area: number;
  trashed: boolean;
  unverified: string[];
}

export async function exportListPdf(name: string, rows: ListPdfRow[]) {
  const { doc, autoTable } = await newDoc();
  const totW = rows.reduce((s, r) => s + r.unit * r.quantity, 0);
  const totA = rows.reduce((s, r) => s + r.area * r.quantity, 0);
  const totN = rows.reduce((s, r) => s + r.quantity, 0);
  const heaviest = rows.reduce<ListPdfRow | null>((b, r) => (!b || r.unit > b.unit ? r : b), null);
  const unverified = [...new Set(rows.flatMap((r) => r.unverified))];

  let y = header(doc, "Poids de livraison", name);
  y = bigBoxes(doc, y, [
    ["Poids total", fmt(totW, 0), "kg"],
    ["Poids moyen", fmt(totA ? totW / totA : NaN, 1), "kg/m²"],
  ]);
  y = facts(doc, y, [
    ["Éléments", `${fmt(totN, 0)} pce`],
    ["Surface totale", `${fmt(totA, 2)} m²`],
    ...(heaviest ? ([["Le plus lourd", `${heaviest.name} — ${heaviest.unit} kg`]] as [string, string][]) : []),
  ]);

  let totalLine: { page: number; y: number } | null = null;
  autoTable(doc, {
    ...tableStyles,
    startY: y + 2,
    margin: { left: M, right: M, bottom: M + 8 },
    head: [["ÉLÉMENT", "QTÉ", "UNITAIRE (KG)", "SURFACE (M²)", "TOTAL (KG)"]],
    body: rows.map((r) => [
      r.name + (r.trashed ? " · dans la corbeille" : ""),
      fmt(r.quantity, 0),
      fmt(r.unit, 0),
      fmt(r.area, 3),
      fmt(r.unit * r.quantity, 0),
    ]),
    foot: [["Total", fmt(totN, 0), "", fmt(totA, 2), fmt(totW, 0)]],
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    columnStyles: { 1: { halign: "right", cellWidth: 18 }, 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 30 }, 4: { halign: "right", cellWidth: 28 } },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index >= 1) d.cell.styles.halign = "right";
      if (d.section === "foot") { d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = INK; if (d.column.index >= 1) d.cell.styles.halign = "right"; }
      const r = rows[d.row.index];
      if (d.section === "body" && r) {
        if (r === heaviest && rows.length > 1) d.cell.styles.fillColor = [248, 236, 233];
        if (r.trashed && d.column.index === 0) d.cell.styles.textColor = RED;
      }
    },
    didDrawCell: (d) => {
      if (d.section === "foot" && d.column.index === 0) {
        totalLine = { page: doc.getCurrentPageInfo().pageNumber, y: d.cell.y };
      }
    },
  });

  drawTotalLine(doc, totalLine);
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  closing(doc, endY + 6, unverified);
  pdfSink.save(doc, `Poids livraison - ${safeName(name)}.pdf`);
}
