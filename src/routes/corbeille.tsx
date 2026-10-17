import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useData, useRefresh, fmtDate } from "@/lib/queries";
import { write } from "@/lib/pin";

export const Route = createFileRoute("/corbeille")({
  head: () => ({
    meta: [
      { title: "Corbeille et sauvegarde — Masse" },
      { name: "description", content: "Restaurez les éléments supprimés et sauvegardez vos données en JSON." },
      { property: "og:title", content: "Corbeille et sauvegarde — Masse" },
      { property: "og:description", content: "Corbeille 30 jours et export / import JSON." },
    ],
  }),
  component: TrashPage,
});

const DAY = 86400000;

function TrashPage() {
  const { data, isLoading } = useData();
  const refresh = useRefresh();
  if (isLoading || !data) return <p className="text-muted-foreground">Chargement…</p>;

  const recent = (d: string | null) => d && Date.now() - new Date(d).getTime() < 30 * DAY;
  const items = [
    ...data.materials.filter((m) => recent(m.deleted_at)).map((m) => ({ table: "materials", kind: "Matériau", id: m.id, name: m.name, at: m.deleted_at! })),
    ...data.elements.filter((m) => recent(m.deleted_at)).map((m) => ({ table: "elements", kind: "Élément", id: m.id, name: m.name, at: m.deleted_at! })),
    ...data.lists.filter((m) => recent(m.deleted_at)).map((m) => ({ table: "lists", kind: "Liste", id: m.id, name: m.name, at: m.deleted_at! })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const restore = async (t: string, id: string) => {
    const r = await write("set_deleted", { p_table: t, p_id: id, p_deleted: false });
    if (r) {
      toast.success("Restauré.");
      refresh();
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: "masse", version: 1, exported_at: new Date().toISOString(), ...data.raw }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `masse-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importJson = async (f: File) => {
    let p: unknown;
    try {
      p = JSON.parse(await f.text());
    } catch {
      return toast.error("Fichier JSON illisible.");
    }
    if (!confirm("Importer ce fichier ? Les entrées existantes portant le même identifiant seront remplacées.")) return;
    const r = await write("import_all", { p });
    if (r) {
      toast.success(`Import terminé (${r.count} entrées).`);
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="card-title">Corbeille (30 jours)</h2>
        <table className="tbl mt-3">
          <thead><tr><th>Type</th><th>Nom</th><th>Supprimé le</th><th></th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.kind}</td>
                <td>{i.name}</td>
                <td className="font-mono text-xs">{fmtDate(i.at)}</td>
                <td className="text-right"><button className="btn btn-sm" onClick={() => restore(i.table, i.id)}>Restaurer</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={4} className="text-muted-foreground">La corbeille est vide.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="panel p-5">
        <h2 className="card-title">Sauvegarde</h2>
        <p className="mt-2 text-sm text-muted-foreground">Exportez toute la bibliothèque, les éléments et les listes dans un fichier JSON. L'import demande le PIN.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={exportJson}>Exporter (JSON)</button>
          <label className="btn cursor-pointer">
            Importer (JSON)
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
          </label>
        </div>
      </section>
    </div>
  );
}
