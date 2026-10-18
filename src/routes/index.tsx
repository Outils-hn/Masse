import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useData, useRefresh, fmtDate, copyText, type ElementRow } from "@/lib/queries";
import { write } from "@/lib/pin";
import { NumInput } from "@/components/NumInput";
import { ElementFiche, printWithTitle } from "@/components/Fiche";
import { CATEGORIES, MODES, elementResult, fmt, glassThickness, type Component, type ElementData, type Material } from "@/lib/calc";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Éléments — Masse" },
      { name: "description", content: "Composez vos éléments de façade et obtenez leur poids total et au m²." },
      { property: "og:title", content: "Éléments — Masse" },
      { property: "og:description", content: "Poids d'éléments de façade calculé à partir de leurs composants." },
    ],
  }),
  component: ElementsPage,
});

const blank = (): ElementData => ({ name: "Nouvel élément", description: "", length_mm: 1000, height_mm: 2000, markup_pct: 5, components: [] });
const SEG = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-1)", "var(--heading)", "var(--chart-5)"];

/** Empreinte du contenu modifiable d'un element (ordre des champs fige) pour detecter les modifs. */
function snapshot(d: ElementData | null): string {
  if (!d) return "";
  return JSON.stringify([
    d.name, d.description, d.length_mm, d.height_mm, d.markup_pct,
    d.components.map((c) => [c.material_id, c.label ?? "", c.thickness_mm, c.faces, c.length_m, c.count, c.custom_area_m2, c.glass_composition]),
  ]);
}

function ElementsPage() {
  const { data, isLoading, error } = useData();
  const refresh = useRefresh();
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ElementData | null>(null);
  // Etat de reference (dernier etat enregistre / charge) pour savoir s'il y a des modifs en cours
  const [baseline, setBaseline] = useState<string>("");
  const [q, setQ] = useState("");

  const elements = useMemo(() => (data?.elements ?? []).filter((e) => !e.deleted_at), [data]);
  const mats = useMemo(() => new Map((data?.materials ?? []).map((m) => [m.id, m])), [data]);
  const activeMats = (data?.materials ?? []).filter((m) => !m.deleted_at);

  const dirty = draft !== null && snapshot(draft) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Bloque le changement d'onglet (et la fermeture de la page) s'il reste des modifs non enregistrees
  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !confirm("Des modifications ne sont pas enregistrées. Les abandonner ?"),
    enableBeforeUnload: () => dirtyRef.current,
  });

  useEffect(() => {
    if (!data) return;
    if (selId === null && !draft && elements[0]) select(elements[0]);
    else if (selId) {
      // Rechargement des donnees (ex. retour sur l'onglet) : on ne remplace le brouillon
      // que s'il n'a pas de modifs en cours, sinon on ecraserait le travail de l'utilisateur
      const e = elements.find((x) => x.id === selId);
      if (e && !dirtyRef.current) select(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function select(e: ElementRow) {
    setSelId(e.id);
    setDraft(structuredClone(e));
    setBaseline(snapshot(e));
  }
  const confirmLeave = () => !dirtyRef.current || confirm("Des modifications ne sont pas enregistrées. Les abandonner ?");

  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error) return <p className="text-destructive">Impossible de charger les données.</p>;

  const save = async () => {
    if (!draft) return;
    if (draft.components.some((c) => !c.material_id)) {
      toast.error("Choisissez un matériau pour chaque composant (ou retirez la ligne vide).");
      return;
    }
    const r = await write("save_element", { p: draft });
    if (r) {
      toast.success("Élément enregistré.");
      setBaseline(snapshot(draft));
      dirtyRef.current = false;
      setSelId(r.id);
      await refresh();
    }
  };
  const duplicate = async (e: ElementData) => {
    if (e.components.some((c) => !c.material_id)) {
      toast.error("Choisissez un matériau pour chaque composant avant de dupliquer.");
      return;
    }
    if (dirtyRef.current && !confirm("La copie reprendra vos modifications, mais l'élément d'origine ne sera pas enregistré. Continuer ?")) return;
    const r = await write("save_element", { p: { ...e, id: null, name: e.name + " (copie)" } });
    if (r) {
      toast.success("Élément dupliqué.");
      // On vide le brouillon : le rechargement ouvrira la copie
      setDraft(null);
      setBaseline("");
      dirtyRef.current = false;
      setSelId(r.id);
      await refresh();
    }
  };
  const remove = async () => {
    if (!selId) return;
    // Prevenir si l'element sert dans des listes : leur poids total en depend
    const usedIn = (data?.lists ?? []).filter((l) => !l.deleted_at && l.items.some((it) => it.element_id === selId)).map((l) => l.name);
    const msg = usedIn.length
      ? `Cet élément est utilisé dans ${usedIn.length > 1 ? "les listes" : "la liste"} : ${usedIn.join(", ")}.\nIl y restera signalé « dans la corbeille ».\n\nMettre cet élément à la corbeille ?`
      : "Mettre cet élément à la corbeille ?";
    if (!confirm(msg)) return;
    const r = await write("set_deleted", { p_table: "elements", p_id: selId, p_deleted: true });
    if (r) {
      toast.success("Élément mis à la corbeille.");
      dirtyRef.current = false;
      setSelId(null);
      setDraft(null);
      await refresh();
    }
  };

  const filtered = elements.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="panel h-fit p-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Éléments</h2>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              if (!confirmLeave()) return;
              // Nouvel element : baseline vide => il compte comme "non enregistre" tant qu'il n'est pas sauve
              setSelId(null);
              setDraft(blank());
              setBaseline("");
            }}
          >+ Nouveau</button>
        </div>
        <input className="field mt-3" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-3 space-y-1">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => e.id !== selId && confirmLeave() && select(e)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${e.id === selId ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
              >
                <div className="font-medium">{e.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{fmt(e.length_mm, 0)} × {fmt(e.height_mm, 0)} mm</div>
              </button>
            </li>
          ))}
          {!filtered.length && <li className="text-sm text-muted-foreground">Aucun élément.</li>}
        </ul>
      </aside>

      {draft ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          mats={mats}
          activeMats={activeMats}
          onSave={save}
          onDuplicate={() => duplicate(draft)}
          onDelete={selId ? remove : undefined}
          updatedAt={elements.find((e) => e.id === selId)?.updated_at}
          dirty={dirty}
          saved={selId !== null}
        />
      ) : (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <p>Aucun élément ouvert.</p>
          <button className="btn btn-primary" onClick={() => { setSelId(null); setDraft(blank()); setBaseline(""); }}>
            {elements.length ? "Créer un élément" : "Créer mon premier élément"}
          </button>
        </div>
      )}
    </div>
  );
}

function Editor({
  draft, setDraft, mats, activeMats, onSave, onDuplicate, onDelete, updatedAt, dirty, saved,
}: {
  draft: ElementData;
  setDraft: (d: ElementData) => void;
  mats: Map<string, Material>;
  activeMats: Material[];
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: (() => void) | undefined;
  updatedAt: string | undefined;
  dirty: boolean;
  saved: boolean;
}) {
  const set = (p: Partial<ElementData>) => setDraft({ ...draft, ...p });
  const setComp = (i: number, p: Partial<Component>) => set({ components: draft.components.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const move = (i: number, d: number) => {
    const arr = [...draft.components];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    set({ components: arr });
  };
  // Nouveau composant SANS materiau preselectionne : avant, le 1er de la liste (Acier, 2 mm)
  // etait compte d'office, avec le risque de garder un poids d'acier non voulu
  const addComp = () => {
    if (!activeMats.length) { toast.error("Ajoutez d'abord un matériau à la bibliothèque."); return; }
    set({ components: [...draft.components, { material_id: "", thickness_mm: 0, faces: 1, length_m: 1, count: 1, custom_area_m2: null, glass_composition: "" }] });
  };
  // Premier choix de materiau : epaisseur de depart plausible selon la categorie
  const pickMaterial = (i: number, id: string) => {
    const c = draft.components[i]!;
    const mat = mats.get(id);
    const first = c.material_id === "";
    const thick = mat?.category === "isolant" ? 100 : mat?.category === "metal" ? 2 : mat?.category === "verre" ? 8 : 1;
    setComp(i, { material_id: id, ...(first ? { thickness_mm: thick } : {}) });
  };
  // Materiaux actifs ranges par categorie, pour une liste plus lisible
  const groups = Object.entries(CATEGORIES)
    .map(([k, label]) => ({ label, items: activeMats.filter((x) => x.category === k) }))
    .filter((g) => g.items.length);
  const others = activeMats.filter((x) => !(x.category in CATEGORIES));
  const res = elementResult(draft, mats);

  const copy = async () => {
    const rows = [
      ["Élément", draft.name],
      ["Dimensions (mm)", `${draft.length_mm} x ${draft.height_mm}`],
      [],
      ["Composant", "Mode", "Calcul", "Poids (kg)", "Part (%)"],
      ...res.lines.map((l) => [l.m?.name ?? "?", l.m ? MODES[l.m.mode].label : "", l.formula, fmt(l.kg).replace(/'/g, ""), fmt(res.subtotal ? (l.kg / res.subtotal) * 100 : 0, 1)]),
      [],
      ["Sous-total", "", "", fmt(res.subtotal).replace(/'/g, "")],
      [`Majoration ${draft.markup_pct} %`, "", "", fmt(res.markup).replace(/'/g, "")],
      ["Poids total (arrondi)", "", "", String(res.total)],
      ["Poids au m²", "", "", fmt(res.perM2).replace(/'/g, "")],
    ];
    await copyText(rows.map((r) => r.join("\t")).join("\n"));
    toast.success("Détail copié — collez-le dans Excel.");
  };

  // La fiche doit refleter ce qui est en base : pas d'impression d'un brouillon
  const printFiche = () => {
    if (!saved || dirty) {
      toast.error("Enregistrez l'élément avant d'éditer sa fiche poids.");
      return;
    }
    printWithTitle(`Fiche poids - ${draft.name}`);
  };

  return (
    <div className="space-y-6">
      {saved && <ElementFiche el={draft} mats={mats} />}
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="card-title">Élément</h2>
            {dirty && <span className="status status-dirty">Non enregistré</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={onDuplicate}>Dupliquer</button>
            {onDelete && <button className="btn btn-danger" onClick={onDelete}>Supprimer</button>}
            <button className="btn btn-primary" onClick={onSave}>Enregistrer</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-muted-foreground lg:col-span-2">Nom
            <input className="field mt-1 text-foreground" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="text-xs text-muted-foreground">Largeur L (mm)
            <NumInput className="mt-1" digits={0} value={draft.length_mm} onChange={(v) => set({ length_mm: v ?? 0 })} />
          </label>
          <label className="text-xs text-muted-foreground">Hauteur H (mm)
            <NumInput className="mt-1" digits={0} value={draft.height_mm} onChange={(v) => set({ height_mm: v ?? 0 })} />
          </label>
          <label className="text-xs text-muted-foreground">Majoration (%)
            <NumInput className="mt-1" digits={1} value={draft.markup_pct} onChange={(v) => set({ markup_pct: v ?? 0 })} />
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">Description
            <input className="field mt-1 text-foreground" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Surface de base <span className="font-mono">{fmt(res.area, 3)} m²</span> · Dernière modification : {fmtDate(updatedAt)}
        </p>
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Composants</h2>
          <button className="btn btn-sm" onClick={addComp}>+ Composant</button>
        </div>
        <div className="mt-3 space-y-3">
          {draft.components.map((c, i) => {
            const m = mats.get(c.material_id);
            const l = res.lines[i];
            return (
              <div key={i} className="rounded-md border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[200px] flex-1 text-xs text-muted-foreground">Matériau
                    <select
                      className={`field mt-1 text-foreground ${c.material_id === "" ? "field-error" : ""}`}
                      value={c.material_id}
                      onChange={(e) => pickMaterial(i, e.target.value)}
                    >
                      <option value="" disabled>— Choisir un matériau —</option>
                      {groups.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.items.map((x) => (
                            <option key={x.id} value={x.id}>{x.name} — {fmt(x.value, x.mode === "density" ? 0 : 2)} {MODES[x.mode].unit}</option>
                          ))}
                        </optgroup>
                      ))}
                      {others.map((x) => (
                        <option key={x.id} value={x.id}>{x.name} — {fmt(x.value, x.mode === "density" ? 0 : 2)} {MODES[x.mode].unit}</option>
                      ))}
                      {m?.deleted_at && <option value={m.id}>{m.name} (supprimé)</option>}
                    </select>
                  </label>
                  {m?.mode === "density" && (
                    <>
                      {m.category === "verre" && (
                        <label className="w-32 text-xs text-muted-foreground">Composition verre
                          <input
                            className="field mt-1 font-mono text-foreground"
                            placeholder="6/16/6"
                            value={c.glass_composition}
                            onChange={(e) => {
                              const t = glassThickness(e.target.value);
                              setComp(i, { glass_composition: e.target.value, ...(isNaN(t) ? {} : { thickness_mm: t }) });
                            }}
                          />
                        </label>
                      )}
                      <label className="w-28 text-xs text-muted-foreground">Épaisseur (mm)
                        <NumInput className="mt-1" value={c.thickness_mm} onChange={(v) => setComp(i, { thickness_mm: v ?? 0, glass_composition: "" })} />
                      </label>
                    </>
                  )}
                  {(m?.mode === "density" || m?.mode === "surface") && (
                    <>
                      <label className="w-24 text-xs text-muted-foreground">Faces / couches
                        <NumInput className="mt-1" digits={0} value={c.faces} onChange={(v) => setComp(i, { faces: v ?? 1 })} />
                      </label>
                      <label className="w-36 text-xs text-muted-foreground">Surface perso. (m²)
                        <NumInput className="mt-1" allowEmpty placeholder="L × H" digits={3} value={c.custom_area_m2} onChange={(v) => setComp(i, { custom_area_m2: v })} />
                      </label>
                    </>
                  )}
                  {m?.mode === "linear" && (
                    <label className="w-28 text-xs text-muted-foreground">Longueur (m)
                      <NumInput className="mt-1" digits={3} value={c.length_m} onChange={(v) => setComp(i, { length_m: v ?? 0 })} />
                    </label>
                  )}
                  {(m?.mode === "linear" || m?.mode === "unit") && (
                    <label className="w-24 text-xs text-muted-foreground">Nombre
                      <NumInput className="mt-1" digits={0} value={c.count} onChange={(v) => setComp(i, { count: v ?? 0 })} />
                    </label>
                  )}
                  <div className="ml-auto flex gap-1">
                    <button className="btn btn-sm" title="Monter" onClick={() => move(i, -1)}>↑</button>
                    <button className="btn btn-sm" title="Descendre" onClick={() => move(i, 1)}>↓</button>
                    <button className="btn btn-sm btn-danger" title="Retirer" onClick={() => set({ components: draft.components.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">{l?.formula}</p>
                {c.glass_composition && !isNaN(glassThickness(c.glass_composition)) && (
                  <p className="text-xs text-muted-foreground">Verre {c.glass_composition} → {fmt(glassThickness(c.glass_composition))} mm de verre (gaz et intercalaire négligés, PVB compté).</p>
                )}
              </div>
            );
          })}
          {!draft.components.length && <p className="text-sm text-muted-foreground">Aucun composant. Ajoutez-en un.</p>}
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Résultats</h2>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={copy}>Copier le détail</button>
            <button className="btn btn-sm btn-primary" onClick={printFiche} title="Ouvre l'impression : choisissez « Enregistrer au format PDF »">Fiche PDF</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-md bg-muted p-4">
            <div className="text-xs text-muted-foreground">Poids total</div>
            <div className="big-num mt-2">{res.total}<span className="ml-1 text-lg font-normal">kg</span></div>
          </div>
          <div className="rounded-md bg-muted p-4">
            <div className="text-xs text-muted-foreground">Poids au m²</div>
            <div className="big-num mt-2">{fmt(res.perM2, 1)}<span className="ml-1 text-lg font-normal">kg/m²</span></div>
          </div>
        </div>
        {res.subtotal > 0 && (
          <div className="mt-4 flex h-4 overflow-hidden rounded">
            {res.lines.map((l, i) => (
              <div key={i} title={`${l.m?.name} ${fmt((l.kg / res.subtotal) * 100, 1)} %`} style={{ width: `${(l.kg / res.subtotal) * 100}%`, background: SEG[i % SEG.length] }} />
            ))}
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th></th><th>Composant</th><th className="text-right">Poids (kg)</th><th className="text-right">Part</th></tr></thead>
            <tbody>
              {res.lines.map((l, i) => (
                <tr key={i}>
                  <td><span className="inline-block h-3 w-3 rounded-sm" style={{ background: SEG[i % SEG.length] }} /></td>
                  <td>{l.m?.name ?? <span className="text-muted-foreground">— à choisir —</span>}</td>
                  <td className="num">{fmt(l.kg)}</td>
                  <td className="num">{fmt(res.subtotal ? (l.kg / res.subtotal) * 100 : 0, 1)} %</td>
                </tr>
              ))}
              <tr><td></td><td>Sous-total sans majoration</td><td className="num">{fmt(res.subtotal)}</td><td></td></tr>
              <tr><td></td><td>Majoration {fmt(draft.markup_pct, 1)} %</td><td className="num">{fmt(res.markup)}</td><td></td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-md border border-primary/30 bg-accent px-3 py-2 text-xs text-accent-foreground">
          Estimation — ne remplace pas un calcul de levage ou de transport.
        </p>
      </section>
    </div>
  );
}
