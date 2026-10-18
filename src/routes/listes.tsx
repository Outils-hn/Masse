import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useData, useRefresh, copyText, fmtDate } from "@/lib/queries";
import { write } from "@/lib/pin";
import { NumInput } from "@/components/NumInput";
import { exportListPdf, type ListPdfRow } from "@/lib/fiche-pdf";
import { elementResult, fmt, isUnverified } from "@/lib/calc";

export const Route = createFileRoute("/listes")({
  head: () => ({
    meta: [
      { title: "Listes d'éléments — Masse" },
      { name: "description", content: "Poids total d'une livraison ou d'un lot d'éléments de façade." },
      { property: "og:title", content: "Listes d'éléments — Masse" },
      { property: "og:description", content: "Totaux de poids et de surface pour plusieurs éléments." },
    ],
  }),
  component: ListsPage,
});

type Draft = { id?: string; name: string; items: { element_id: string; quantity: number }[] };
/** Empreinte du contenu modifiable d'une liste, pour detecter les modifs non enregistrees. */
const snapshot = (d: Draft | null) => (d ? JSON.stringify([d.name, d.items.map((i) => [i.element_id, i.quantity])]) : "");
const LEAVE_MSG = "Des modifications de la liste ne sont pas enregistrées. Les abandonner ?";

function ListsPage() {
  const { data, isLoading } = useData();
  const refresh = useRefresh();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const dirty = draft !== null && snapshot(draft) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !confirm(LEAVE_MSG),
    enableBeforeUnload: () => dirtyRef.current,
  });
  // Ouvre une liste (ou une nouvelle) en memorisant son etat de depart
  const open = (d: Draft | null) => {
    if (dirtyRef.current && !confirm(LEAVE_MSG)) return;
    setDraft(d);
    setBaseline(d?.id ? snapshot(d) : "");
  };

  const mats = useMemo(() => new Map((data?.materials ?? []).map((m) => [m.id, m])), [data]);
  if (isLoading || !data) return <p className="text-muted-foreground">Chargement…</p>;
  const lists = data.lists.filter((l) => !l.deleted_at);
  const elements = data.elements.filter((e) => !e.deleted_at);
  const elMap = new Map(data.elements.map((e) => [e.id, e]));

  const rows = (draft?.items ?? []).map((it) => {
    const el = elMap.get(it.element_id);
    const r = el ? elementResult(el, mats) : null;
    return { it, el, unit: r?.total ?? 0, area: r?.area ?? 0 };
  });
  const totW = rows.reduce((s, r) => s + r.unit * r.it.quantity, 0);
  const totA = rows.reduce((s, r) => s + r.area * r.it.quantity, 0);
  const totN = rows.reduce((s, r) => s + r.it.quantity, 0);
  const heaviest = rows.reduce<(typeof rows)[number] | null>((b, r) => (!b || r.unit > b.unit ? r : b), null);

  const save = async () => {
    if (!draft) return;
    const r = await write("save_list", { p: draft });
    if (r) {
      toast.success("Liste enregistrée.");
      setDraft({ ...draft, id: r.id });
      setBaseline(snapshot(draft));
      refresh();
    }
  };
  const del = async () => {
    if (!draft?.id || !confirm("Mettre cette liste à la corbeille ?")) return;
    const r = await write("set_deleted", { p_table: "lists", p_id: draft.id, p_deleted: true });
    if (r) {
      toast.success("Liste mise à la corbeille.");
      dirtyRef.current = false;
      setDraft(null);
      refresh();
    }
  };
  // Lignes de la fiche PDF : on signale les elements a la corbeille et les materiaux non verifies
  const ficheRows: ListPdfRow[] = rows.map((r) => ({
    name: r.el?.name ?? "Élément introuvable",
    quantity: r.it.quantity,
    unit: r.unit,
    area: r.area,
    trashed: !r.el || !!r.el.deleted_at,
    unverified: [...new Set((r.el?.components ?? []).map((c) => mats.get(c.material_id)).filter(isUnverified).map((m) => m!.name))],
  }));
  const printFiche = () => {
    if (!draft?.id || dirty) {
      toast.error("Enregistrez la liste avant d'éditer sa fiche.");
      return;
    }
    exportListPdf(draft.name, ficheRows).catch(() => toast.error("Le PDF n'a pas pu être créé. Réessayez."));
  };

  const copy = async () => {
    const t = [
      ["Liste", draft?.name ?? ""],
      [],
      ["Élément", "Quantité", "Poids unitaire (kg)", "Surface unitaire (m²)", "Poids total (kg)"],
      ...rows.map((r) => [r.el?.name ?? "?", r.it.quantity, r.unit, fmt(r.area, 3).replace(/'/g, ""), r.unit * r.it.quantity]),
      [],
      ["Total", totN, "", fmt(totA, 3).replace(/'/g, ""), totW],
      ["Poids moyen (kg/m²)", fmt(totA ? totW / totA : 0, 1).replace(/'/g, "")],
    ];
    await copyText(t.map((r) => r.join("\t")).join("\n"));
    toast.success("Détail copié — collez-le dans Excel.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="panel h-fit p-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Listes</h2>
          <button className="btn btn-sm btn-primary" onClick={() => open({ name: "Nouvelle liste", items: [] })}>+ Nouvelle</button>
        </div>
        <ul className="mt-3 space-y-1">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => l.id !== draft?.id && open(structuredClone({ id: l.id, name: l.name, items: l.items }))}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${draft?.id === l.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
              >
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(l.updated_at)}</div>
              </button>
            </li>
          ))}
          {!lists.length && <li className="text-sm text-muted-foreground">Aucune liste.</li>}
        </ul>
      </aside>

      {draft ? (
        <div className="space-y-6">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input className="field max-w-sm font-medium" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              {dirty && <span className="status status-dirty">Non enregistré</span>}
              <div className="ml-auto flex gap-2">
                {draft.id && <button className="btn btn-danger" onClick={del}>Supprimer</button>}
                <button className="btn btn-primary" onClick={save}>Enregistrer</button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Élément</th><th className="w-28 text-right">Quantité</th><th className="text-right">Unitaire (kg)</th><th className="text-right">Total (kg)</th><th></th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={r === heaviest && rows.length > 1 ? "bg-accent" : ""}>
                      <td>
                        <select
                          className={`field ${!r.el || r.el.deleted_at ? "field-error" : ""}`}
                          value={r.it.element_id}
                          onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, element_id: e.target.value } : x)) })}
                        >
                          {elements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          {/* Element a la corbeille ou disparu : on l'affiche tel quel au lieu
                              de laisser le select montrer le nom d'un autre element */}
                          {r.el?.deleted_at && <option value={r.el.id}>{r.el.name} (dans la corbeille)</option>}
                          {!r.el && <option value={r.it.element_id}>Élément introuvable</option>}
                        </select>
                        {r.el?.deleted_at && (
                          <div className="mt-1 text-xs text-destructive">Élément dans la corbeille : restaurez-le ou retirez cette ligne.</div>
                        )}
                      </td>
                      <td><NumInput digits={0} value={r.it.quantity} onChange={(v) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, quantity: v ?? 0 } : x)) })} /></td>
                      <td className="num">{fmt(r.unit, 0)}</td>
                      <td className="num">{fmt(r.unit * r.it.quantity, 0)}</td>
                      <td className="text-right"><button className="btn btn-sm btn-danger" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn btn-sm mt-3"
              onClick={() => elements[0] ? setDraft({ ...draft, items: [...draft.items, { element_id: elements[0].id, quantity: 1 }] }) : toast.error("Créez d'abord un élément.")}
            >+ Ligne</button>
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Résultats de la liste</h2>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={copy}>Copier le détail</button>
                <button className="btn btn-sm btn-primary" onClick={printFiche} title="Télécharge la fiche en PDF">Fiche PDF</button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Poids total" v={fmt(totW, 0)} u="kg" />
              <Stat label="Surface totale" v={fmt(totA, 2)} u="m²" />
              <Stat label="Poids moyen" v={fmt(totA ? totW / totA : NaN, 1)} u="kg/m²" />
              <Stat label="Nombre d'éléments" v={fmt(totN, 0)} u="pce" />
            </div>
            {heaviest?.el && (
              <p className="mt-4 rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm text-accent-foreground">
                Élément le plus lourd : <strong>{heaviest.el.name}</strong> — <span className="font-mono">{heaviest.unit} kg</span> par pièce.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Estimation — ne remplace pas un calcul de levage ou de transport.</p>
          </section>
        </div>
      ) : (
        <div className="panel p-8 text-center text-muted-foreground">Sélectionnez ou créez une liste.</div>
      )}
    </div>
  );
}

function Stat({ label, v, u }: { label: string; v: string; u: string }) {
  return (
    <div className="rounded-md bg-muted p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-heading">{v}<span className="ml-1 text-sm font-normal">{u}</span></div>
    </div>
  );
}
