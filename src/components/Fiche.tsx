import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { elementResult, fmt, MODES, type ElementData, type Material } from "@/lib/calc";

// Fiche poids imprimable (A4). Rendue en permanence dans un "portail" a la racine
// de la page, invisible a l'ecran ; a l'impression, le CSS (styles.css, @media print)
// masque l'appli et n'affiche que la fiche. L'utilisateur choisit alors
// "Enregistrer au format PDF" dans la fenetre d'impression.

const SEG = ["#9A4A3A", "#3F6B5C", "#C08A3E", "#5B6B8C", "#8C5B7A", "#1E293B", "#7A8C5B"];

/** Un materiau est "non verifie" tant que sa source contient la mention d'origine. */
export const isUnverified = (m?: Material) => !!m && /à vérifier/i.test(m.source);

/** Lance l'impression en donnant un nom de fichier propre au PDF (Chrome/Edge reprennent le titre). */
export function printWithTitle(title: string) {
  const before = document.title;
  document.title = title.replace(/[\\/:*?"<>|]/g, "-");
  const restore = () => {
    document.title = before;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

function PrintPortal({ children }: { children: ReactNode }) {
  // Rendu cote client uniquement (pas de document pendant le rendu serveur)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<div className="print-root">{children}</div>, document.body);
}

const today = () => new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

function Header({ kind }: { kind: string }) {
  return (
    <div className="fiche-head">
      <div className="fiche-brand">Masse<span>.</span></div>
      <div className="fiche-kind">{kind} · {today()}</div>
    </div>
  );
}

function Footer({ unverified }: { unverified: string[] }) {
  return (
    <>
      {unverified.length > 0 && (
        <div className="fiche-warn">
          <strong>Valeurs non vérifiées :</strong> {unverified.join(", ")}. Ces matériaux utilisent encore une
          valeur standard : à confirmer avant de transmettre ce poids.
        </div>
      )}
      <div className="fiche-note">Estimation — ne remplace pas un calcul de levage ou de transport.</div>
      <div className="fiche-foot">Établi par H. N. · Masse · {today()}</div>
    </>
  );
}

export function ElementFiche({ el, mats }: { el: ElementData; mats: Map<string, Material> }) {
  const res = elementResult(el, mats);
  const unverified = [...new Set(res.lines.filter((l) => isUnverified(l.m)).map((l) => l.m!.name))];
  return (
    <PrintPortal>
      <div className="fiche">
        <Header kind="Fiche poids" />
        <h1 className="fiche-title">{el.name}</h1>
        {el.description && <p className="fiche-desc">{el.description}</p>}

        <div className="fiche-facts">
          <div><span>Dimensions</span>{fmt(el.length_mm, 0)} × {fmt(el.height_mm, 0)} mm</div>
          <div><span>Surface</span>{fmt(res.area, 3)} m²</div>
          <div><span>Majoration</span>{fmt(el.markup_pct, 1)} %</div>
        </div>

        <div className="fiche-big">
          <div><span>Poids total</span><b>{res.total}</b> kg</div>
          <div><span>Poids au m²</span><b>{fmt(res.perM2, 1)}</b> kg/m²</div>
        </div>

        {res.subtotal > 0 && (
          <div className="fiche-bar">
            {res.lines.map((l, i) => (
              <div key={i} style={{ width: `${(l.kg / res.subtotal) * 100}%`, background: SEG[i % SEG.length] }} />
            ))}
          </div>
        )}

        <table className="fiche-tbl">
          <thead>
            <tr><th></th><th>Composant</th><th>Calcul</th><th className="r">Poids (kg)</th><th className="r">Part</th></tr>
          </thead>
          <tbody>
            {res.lines.map((l, i) => (
              <tr key={i}>
                <td><span className="sw" style={{ background: SEG[i % SEG.length] }} /></td>
                <td>
                  {l.m?.name ?? "?"}
                  {l.m && <div className="sub">{MODES[l.m.mode].label}{isUnverified(l.m) && <em> · à vérifier</em>}</div>}
                </td>
                <td className="mono small">{l.formula}</td>
                <td className="r mono">{fmt(l.kg)}</td>
                <td className="r mono">{fmt(res.subtotal ? (l.kg / res.subtotal) * 100 : 0, 1)} %</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td></td><td colSpan={2}>Sous-total sans majoration</td><td className="r mono">{fmt(res.subtotal)}</td><td></td></tr>
            <tr><td></td><td colSpan={2}>Majoration {fmt(el.markup_pct, 1)} %</td><td className="r mono">{fmt(res.markup)}</td><td></td></tr>
            <tr className="tot"><td></td><td colSpan={2}>Poids total (arrondi au kg supérieur)</td><td className="r mono">{res.total}</td><td></td></tr>
          </tfoot>
        </table>

        <Footer unverified={unverified} />
      </div>
    </PrintPortal>
  );
}

export interface ListFicheRow {
  name: string;
  quantity: number;
  unit: number;
  area: number;
  trashed: boolean;
  unverified: string[];
}

export function ListFiche({ name, rows }: { name: string; rows: ListFicheRow[] }) {
  const totW = rows.reduce((s, r) => s + r.unit * r.quantity, 0);
  const totA = rows.reduce((s, r) => s + r.area * r.quantity, 0);
  const totN = rows.reduce((s, r) => s + r.quantity, 0);
  const heaviest = rows.reduce<ListFicheRow | null>((b, r) => (!b || r.unit > b.unit ? r : b), null);
  const unverified = [...new Set(rows.flatMap((r) => r.unverified))];
  return (
    <PrintPortal>
      <div className="fiche">
        <Header kind="Poids de livraison" />
        <h1 className="fiche-title">{name}</h1>

        <div className="fiche-big">
          <div><span>Poids total</span><b>{fmt(totW, 0)}</b> kg</div>
          <div><span>Poids moyen</span><b>{fmt(totA ? totW / totA : NaN, 1)}</b> kg/m²</div>
        </div>
        <div className="fiche-facts">
          <div><span>Éléments</span>{fmt(totN, 0)} pce</div>
          <div><span>Surface totale</span>{fmt(totA, 2)} m²</div>
          {heaviest && <div><span>Le plus lourd</span>{heaviest.name} — {heaviest.unit} kg</div>}
        </div>

        <table className="fiche-tbl">
          <thead>
            <tr><th>Élément</th><th className="r">Qté</th><th className="r">Unitaire (kg)</th><th className="r">Surface (m²)</th><th className="r">Total (kg)</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r === heaviest && rows.length > 1 ? "hl" : ""}>
                <td>{r.name}{r.trashed && <em> · dans la corbeille</em>}</td>
                <td className="r mono">{fmt(r.quantity, 0)}</td>
                <td className="r mono">{fmt(r.unit, 0)}</td>
                <td className="r mono">{fmt(r.area, 3)}</td>
                <td className="r mono">{fmt(r.unit * r.quantity, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="tot"><td>Total</td><td className="r mono">{fmt(totN, 0)}</td><td></td><td className="r mono">{fmt(totA, 2)}</td><td className="r mono">{fmt(totW, 0)}</td></tr>
          </tfoot>
        </table>

        <Footer unverified={unverified} />
      </div>
    </PrintPortal>
  );
}
