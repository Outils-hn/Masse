import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useData, useRefresh, fmtDate } from "@/lib/queries";
import { write } from "@/lib/pin";
import { NumInput } from "@/components/NumInput";
import { Etat } from "@/components/masse/Etat";
import { ask } from "@/lib/confirm";
import { materialProblems } from "@/lib/validate";
import { CATEGORIES, MODES, fmt, isUnverified, type Material, type Mode } from "@/lib/calc";

export const Route = createFileRoute("/materiaux")({
  head: () => ({
    meta: [
      { title: "Bibliothèque de matériaux — Masse" },
      { name: "description", content: "Densités, poids surfaciques, linéiques et unitaires des matériaux de façade." },
      { property: "og:title", content: "Bibliothèque de matériaux — Masse" },
      { property: "og:description", content: "Les matériaux de référence pour estimer le poids des éléments de façade." },
    ],
  }),
  component: MaterialsPage,
});

type Draft = Partial<Material> & { mode: Mode; value: number; name: string; category: string; source: string; note: string };
const blank: Draft = { name: "", category: "metal", mode: "density", value: 0, source: "", note: "" };

function MaterialsPage() {
  const { data, isLoading, error } = useData();
  const refresh = useRefresh();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);

  if (isLoading || error || !data) return <Etat isLoading={isLoading} error={error} />;
  const used = new Set(data.elements.filter((e) => !e.deleted_at).flatMap((e) => e.components.map((c) => c.material_id)));
  const list = data.materials.filter(
    (m) => !m.deleted_at && (!cat || m.category === cat) && (m.name + " " + m.source + " " + m.note).toLowerCase().includes(q.toLowerCase()),
  );

  const save = async () => {
    if (!edit) return;
    const pb = materialProblems(edit);
    if (pb) { toast.error(pb); return; }
    // Changer le mode (ex. kg/m³ -> kg/m²) d'un materiau deja utilise change le sens
    // des saisies dans tous les elements concernes : on demande confirmation
    const before = edit.id ? data.materials.find((m) => m.id === edit.id) : undefined;
    if (before && before.mode !== edit.mode) {
      const els = data.elements.filter((e) => !e.deleted_at && e.components.some((c) => c.material_id === before.id)).map((e) => e.name);
      if (els.length && !(await ask({
        title: "Changer le mode de calcul ?",
        message:
          `Ce matériau est utilisé dans ${els.length} élément(s) : ${els.join(", ")}.\n` +
          `Passer de « ${MODES[before.mode].label} » à « ${MODES[edit.mode].label} » va modifier leur poids et les champs à saisir.\n\n` +
          "Astuce : dupliquez plutôt le matériau.",
        confirm: "Changer quand même",
        danger: true,
      }))) return;
    }
    const r = await write("save_material", { p: edit });
    if (r) {
      toast.success("Matériau enregistré.");
      setEdit(null);
      refresh();
    }
  };
  const del = async (m: Material) => {
    if (used.has(m.id)) { toast.error("Ce matériau est utilisé dans un élément : suppression impossible."); return; }
    if (!(await ask({ title: `Mettre « ${m.name} » à la corbeille ?`, message: "Vous pourrez le restaurer pendant 30 jours.", confirm: "Mettre à la corbeille", danger: true }))) return;
    const r = await write("set_deleted", { p_table: "materials", p_id: m.id, p_deleted: true });
    if (r) {
      toast.success("Matériau mis à la corbeille.");
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="card-title mr-auto">Bibliothèque de matériaux</h2>
          <input className="field w-56" aria-label="Rechercher un matériau" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field w-48" aria-label="Filtrer par catégorie" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Toutes catégories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>+ Matériau</button>
        </div>

        {edit && (
          <div className="mt-4 grid gap-3 rounded-md border bg-muted/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground lg:col-span-2">Nom
              <input className="field mt-1 text-foreground" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="text-xs text-muted-foreground">Catégorie
              <select className="field mt-1 text-foreground" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Mode de calcul
              <select className="field mt-1 text-foreground" value={edit.mode} onChange={(e) => setEdit({ ...edit, mode: e.target.value as Mode })}>
                {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.unit})</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Valeur ({MODES[edit.mode].unit})
              <NumInput className="mt-1" digits={3} value={edit.value} invalid={!(edit.value > 0)} onChange={(v) => setEdit({ ...edit, value: v ?? 0 })} />
            </label>
            <label className="text-xs text-muted-foreground">Source
              <input className="field mt-1 text-foreground" value={edit.source} placeholder="ex. fiche technique Rockwool 2025" onChange={(e) => setEdit({ ...edit, source: e.target.value })} />
              {/à vérifier/i.test(edit.source) && (
                <span className="mt-1 block text-[0.7rem] text-[color:var(--warning)]">Remplacez par la référence de votre fiche technique pour retirer « À vérifier ».</span>
              )}
            </label>
            <label className="text-xs text-muted-foreground lg:col-span-2">Note
              <input className="field mt-1 text-foreground" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
              <button className="btn" onClick={() => setEdit(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={save}>Enregistrer</button>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Nom</th><th>Catégorie</th><th>Mode</th><th className="text-right">Valeur</th><th>Source</th><th>Modifié</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}{m.note && <div className="text-xs font-normal text-muted-foreground">{m.note}</div>}</td>
                  <td>{CATEGORIES[m.category] ?? m.category}</td>
                  <td>{MODES[m.mode].label}</td>
                  <td className="num whitespace-nowrap">{fmt(m.value, m.mode === "density" ? 0 : 2)} <span className="text-muted-foreground">{MODES[m.mode].unit}</span></td>
                  <td className="text-xs text-muted-foreground">
                    {/* Valeur standard jamais verifiee : pastille bien visible, qui disparait
                        des que la source est remplacee (ex. nom de la fiche technique) */}
                    {isUnverified(m) ? <span className="badge-warn" title={m.source}>À vérifier</span> : m.source}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtDate(m.updated_at)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn btn-sm" onClick={() => setEdit({ ...m })}>Modifier</button>{" "}
                    <button className="btn btn-sm" onClick={() => setEdit({ ...m, id: "", name: m.name + " (copie)" })}>Dupliquer</button>{" "}
                    <button className="btn btn-sm btn-danger" onClick={() => del(m)}>Supprimer</button>
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={7} className="text-muted-foreground">Aucun matériau.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
