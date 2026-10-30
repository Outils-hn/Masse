import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useData, useRefresh, fmtDate, copyText, type ElementRow } from "@/lib/queries";
import { write } from "@/lib/pin";
import { ask, askLeave } from "@/lib/confirm";
import { NumInput } from "@/components/NumInput";
import { Etat } from "@/components/masse/Etat";
import { exportElementPdf } from "@/lib/fiche-pdf";
import { elementProblems, summary, type Problems } from "@/lib/validate";
import { FicheIndexLien } from "@/components/famille/FicheIndexLien";
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
// Brique d'abord (couleur de Masse), puis des teintes sourdes ; memes couleurs que la fiche PDF
const SEG = ["var(--color-masse)", "#3F6B5C", "#C08A3E", "#5B6B8C", "#8C5B7A", "var(--seg-ink)", "#7A8C5B"];

/** Empreinte du contenu modifiable d'un element (ordre des champs fige) pour detecter les modifs. */
function snapshot(d: ElementData | null): string {
  if (!d) return "";
  return JSON.stringify([
    d.name, d.description, d.length_mm, d.height_mm, d.markup_pct,
    d.components.map((c) => [c.material_id, c.label ?? "", c.thickness_mm, c.faces, c.length_m, c.count, c.custom_area_m2, c.glass_composition]),
  ]);
}

type Update = (fn: (d: ElementData) => ElementData) => void;

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
  const activeMats = useMemo(() => (data?.materials ?? []).filter((m) => !m.deleted_at), [data]);

  const dirty = draft !== null && snapshot(draft) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Bloque le changement d'onglet (et la fermeture de la page) s'il reste des modifs non enregistrees
  useBlocker({
    shouldBlockFn: async () => dirtyRef.current && !(await askLeave()),
    enableBeforeUnload: () => dirtyRef.current,
  });

  const select = useCallback((e: ElementRow) => {
    setSelId(e.id);
    setDraft(structuredClone(e));
    setBaseline(snapshot(e));
  }, []);

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

  const confirmLeave = async () => !dirtyRef.current || (await askLeave());
  const pick = useCallback(async (e: ElementRow) => {
    if (await confirmLeave()) select(e);
  }, [select]);
  const update: Update = useCallback((fn) => setDraft((d) => (d ? fn(d) : d)), []);
  const problems = useMemo<Problems>(() => (draft ? elementProblems(draft, mats) : {}), [draft, mats]);
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return elements.filter((e) => e.name.toLowerCase().includes(ql));
  }, [elements, q]);

  if (isLoading || error || !data) return <Etat isLoading={isLoading} error={error} />;

  const save = async () => {
    if (!draft) return;
    const pb = summary(problems);
    if (pb) { toast.error(pb); return; }
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
    const pb = summary(problems);
    if (pb) { toast.error(pb); return; }
    if (dirtyRef.current && !(await ask({
      title: "Dupliquer avec les modifications ?",
      message: "La copie reprendra vos modifications, mais l'élément d'origine ne sera pas enregistré.",
      confirm: "Dupliquer",
    }))) return;
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
    const usedIn = (data.lists ?? []).filter((l) => !l.deleted_at && l.items.some((it) => it.element_id === selId)).map((l) => l.name);
    const ok = await ask({
      title: "Mettre cet élément à la corbeille ?",
      message: usedIn.length
        ? `Il est utilisé dans ${usedIn.length > 1 ? "les listes" : "la liste"} : ${usedIn.join(", ")}. Il y restera signalé « dans la corbeille ».\nVous pourrez le restaurer pendant 30 jours.`
        : "Vous pourrez le restaurer pendant 30 jours.",
      confirm: "Mettre à la corbeille",
      danger: true,
    });
    if (!ok) return;
    const r = await write("set_deleted", { p_table: "elements", p_id: selId, p_deleted: true });
    if (r) {
      toast.success("Élément mis à la corbeille.");
      dirtyRef.current = false;
      setSelId(null);
      setDraft(null);
      await refresh();
    }
  };
  const create = async () => {
    if (!(await confirmLeave())) return;
    // Nouvel element : baseline vide => il compte comme "non enregistre" tant qu'il n'est pas sauve
    setSelId(null);
    setDraft(blank());
    setBaseline("");
  };


  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="panel h-fit p-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Éléments</h2>
          <button className="btn btn-sm btn-primary" onClick={create}>+ Nouveau</button>
        </div>
        <input className="field mt-3" aria-label="Rechercher un élément" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ElementList items={filtered} selId={selId} onPick={pick} />
      </aside>

      {draft ? (
        <Editor
          draft={draft}
          update={update}
          mats={mats}
          activeMats={activeMats}
          problems={problems}
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

/** Liste de gauche, mise a part : elle n'est plus redessinee a chaque frappe dans l'editeur. */
const ElementList = memo(function ElementList({ items, selId, onPick }: { items: ElementRow[]; selId: string | null; onPick: (e: ElementRow) => void }) {
  return (
    <ul className="mt-3 space-y-1">
      {items.map((e) => (
        <li key={e.id}>
          <button
            onClick={() => e.id !== selId && onPick(e)}
            aria-current={e.id === selId || undefined}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${e.id === selId ? "bg-muted text-foreground" : "hover:bg-muted/60"}`}
          >
            <div className="font-medium">{e.name}</div>
            <div className="num text-left text-xs text-muted-foreground">{fmt(e.length_mm, 0)} × {fmt(e.height_mm, 0)} mm</div>
          </button>
        </li>
      ))}
      {!items.length && <li className="text-sm text-muted-foreground">Aucun élément.</li>}
    </ul>
  );
});

function FieldError({ id, msg }: { id: string; msg: string | undefined }) {
  return msg ? <span id={id} className="mt-1 block text-[0.7rem] text-destructive">{msg}</span> : null;
}

function Editor({
  draft, update, mats, activeMats, problems, onSave, onDuplicate, onDelete, updatedAt, dirty, saved,
}: {
  draft: ElementData;
  update: Update;
  mats: Map<string, Material>;
  activeMats: Material[];
  problems: Problems;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: (() => void) | undefined;
  updatedAt: string | undefined;
  dirty: boolean;
  saved: boolean;
}) {
  const set = (p: Partial<ElementData>) => update((d) => ({ ...d, ...p }));
  const setComp = useCallback(
    (i: number, p: Partial<Component>) => update((d) => ({ ...d, components: d.components.map((c, j) => (j === i ? { ...c, ...p } : c)) })),
    [update],
  );
  const move = useCallback((i: number, dir: number) => update((d) => {
    const arr = [...d.components];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return d;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    return { ...d, components: arr };
  }), [update]);
  const removeComp = useCallback((i: number) => update((d) => ({ ...d, components: d.components.filter((_, j) => j !== i) })), [update]);
  // Nouveau composant SANS materiau preselectionne : avant, le 1er de la liste (Acier, 2 mm)
  // etait compte d'office, avec le risque de garder un poids d'acier non voulu
  const addComp = () => {
    if (!activeMats.length) { toast.error("Ajoutez d'abord un matériau à la bibliothèque."); return; }
    update((d) => ({ ...d, components: [...d.components, { material_id: "", thickness_mm: 0, faces: 1, length_m: 1, count: 1, custom_area_m2: null, glass_composition: "" }] }));
  };
  // Premier choix de materiau : epaisseur de depart plausible selon la categorie
  const pickMaterial = useCallback((i: number, id: string) => {
    const mat = mats.get(id);
    const thick = mat?.category === "isolant" ? 100 : mat?.category === "metal" ? 2 : mat?.category === "verre" ? 8 : 1;
    update((d) => ({
      ...d,
      components: d.components.map((c, j) => (j === i ? { ...c, material_id: id, ...(c.material_id === "" ? { thickness_mm: thick } : {}) } : c)),
    }));
  }, [mats, update]);
  // Materiaux actifs ranges par categorie, pour une liste plus lisible
  const groups = useMemo(() => Object.entries(CATEGORIES)
    .map(([k, label]) => ({ label, items: activeMats.filter((x) => x.category === k) }))
    .filter((g) => g.items.length), [activeMats]);
  const others = useMemo(() => activeMats.filter((x) => !(x.category in CATEGORIES)), [activeMats]);
  const res = elementResult(draft, mats);
  const nbProblems = Object.keys(problems).length;

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
    exportElementPdf(draft, mats).catch(() => toast.error("Le PDF n'a pas pu être créé. Réessayez."));
  };

  return (
    <div className="space-y-6">
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
            <input className={`field mt-1 text-foreground ${problems["name"] ? "field-error" : ""}`} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            <FieldError id="err-name" msg={problems["name"]} />
          </label>
          <label className="text-xs text-muted-foreground">Largeur L (mm)
            <NumInput className="mt-1" digits={0} value={draft.length_mm} invalid={!!problems["length_mm"]} describedBy="err-l" onChange={(v) => set({ length_mm: v ?? 0 })} />
            <FieldError id="err-l" msg={problems["length_mm"]} />
          </label>
          <label className="text-xs text-muted-foreground">Hauteur H (mm)
            <NumInput className="mt-1" digits={0} value={draft.height_mm} invalid={!!problems["height_mm"]} describedBy="err-h" onChange={(v) => set({ height_mm: v ?? 0 })} />
            <FieldError id="err-h" msg={problems["height_mm"]} />
          </label>
          <label className="text-xs text-muted-foreground">Majoration (%)
            <NumInput className="mt-1" digits={1} value={draft.markup_pct} invalid={!!problems["markup_pct"]} describedBy="err-maj" onChange={(v) => set({ markup_pct: v ?? 0 })} />
            <FieldError id="err-maj" msg={problems["markup_pct"]} />
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">Description
            <input className="field mt-1 text-foreground" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Surface de base <span className="num">{fmt(res.area, 3)} m²</span> · Dernière modification : {fmtDate(updatedAt)}
        </p>
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Composants</h2>
          <button className="btn btn-sm" onClick={addComp}>+ Composant</button>
        </div>
        <div className="mt-3 space-y-3">
          {draft.components.map((c, i) => (
            <ComponentRow
              key={i}
              i={i}
              c={c}
              m={mats.get(c.material_id)}
              formula={res.lines[i]?.formula ?? ""}
              groups={groups}
              others={others}
              errs={rowProblems(problems, i)}
              onChange={setComp}
              onPick={pickMaterial}
              onMove={move}
              onRemove={removeComp}
            />
          ))}
          {!draft.components.length && <p className="text-sm text-muted-foreground">Aucun composant. Ajoutez-en un.</p>}
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Résultats</h2>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={copy}>Copier le détail</button>
            <button className="btn btn-sm btn-primary" onClick={printFiche} title="Télécharge la fiche en PDF">Fiche PDF</button>
          </div>
        </div>
        {nbProblems > 0 && (
          <p className="mt-3 text-xs text-destructive" role="status">
            Résultat provisoire : {nbProblems} champ{nbProblems > 1 ? "s" : ""} à corriger avant d'enregistrer.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="key-box">
            <div className="key-label">Poids total</div>
            <div className="big-num mt-2">{fmt(res.total, 0)}<span className="big-unit">kg</span></div>
          </div>
          <div className="key-box">
            <div className="key-label">Poids au m²</div>
            <div className="big-num mt-2">{fmt(res.perM2, 1)}<span className="big-unit">kg/m²</span></div>
          </div>
        </div>
        {res.subtotal > 0 && (
          <div className="mt-4 flex h-2 gap-px overflow-hidden rounded-full">
            {res.lines.map((l, i) => (
              <div key={i} title={`${l.m?.name} ${fmt((l.kg / res.subtotal) * 100, 1)} %`} style={{ width: `${(l.kg / res.subtotal) * 100}%`, background: SEG[i % SEG.length] }} />
            ))}
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th><span className="sr-only">Couleur</span></th><th>Composant</th><th className="text-right">Poids (kg)</th><th className="text-right">Part</th></tr></thead>
            <tbody>
              {res.lines.map((l, i) => (
                <tr key={i}>
                  <td><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: SEG[i % SEG.length] }} /></td>
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
        <p className="mt-4 text-xs text-muted-foreground">
          Estimation — ne remplace pas un calcul de levage ou de transport.
        </p>
      </section>
    </div>
  );
}

/** Messages d'un composant, sous forme de texte stable (la ligne n'est redessinee que s'ils changent). */
function rowProblems(p: Problems, i: number): string {
  const pre = `c${i}.`;
  const o: Record<string, string> = {};
  for (const k in p) if (k.startsWith(pre)) o[k.slice(pre.length)] = p[k]!;
  return JSON.stringify(o);
}

type Group = { label: string; items: Material[] };

/**
 * Une ligne de composant. Isolee et memorisee : avec 50 composants et 200 materiaux,
 * chaque frappe redessinait toutes les listes deroulantes (plus d'une seconde de latence).
 */
const ComponentRow = memo(function ComponentRow({
  i, c, m, formula, groups, others, errs, onChange, onPick, onMove, onRemove,
}: {
  i: number;
  c: Component;
  m: Material | undefined;
  formula: string;
  groups: Group[];
  others: Material[];
  errs: string;
  onChange: (i: number, p: Partial<Component>) => void;
  onPick: (i: number, id: string) => void;
  onMove: (i: number, d: number) => void;
  onRemove: (i: number) => void;
}) {
  const e = JSON.parse(errs) as Record<string, string>;
  const msgs = Object.values(e);
  const glass = c.glass_composition ? glassThickness(c.glass_composition) : NaN;
  const errId = `err-c${i}`;
  return (
    <div className={`rounded-md border p-3 ${msgs.length ? "border-destructive/50" : ""}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1 text-xs text-muted-foreground">Matériau
          <MaterialSelect i={i} value={c.material_id} deleted={m?.deleted_at ? m : undefined} invalid={!!e["material_id"]} groups={groups} others={others} onPick={onPick} />
          {m?.index_id && <span className="mt-1 block"><FicheIndexLien value={{ id: m.index_id, name: m.index_name ?? "Fiche technique" }} /></span>}
        </label>
        {m?.mode === "density" && (
          <>
            {m.category === "verre" && (
              <label className="w-32 text-xs text-muted-foreground">Composition verre
                <input
                  className={`field mt-1 font-mono text-foreground ${e["glass_composition"] ? "field-error" : ""}`}
                  placeholder="6/16/6"
                  value={c.glass_composition}
                  aria-invalid={!!e["glass_composition"] || undefined}
                  aria-describedby={errId}
                  onChange={(ev) => {
                    const t = glassThickness(ev.target.value);
                    onChange(i, { glass_composition: ev.target.value, ...(isNaN(t) ? {} : { thickness_mm: t }) });
                  }}
                />
              </label>
            )}
            <label className="w-28 text-xs text-muted-foreground">Épaisseur (mm)
              <NumInput className="mt-1" value={c.thickness_mm} invalid={!!e["thickness_mm"]} describedBy={errId} onChange={(v) => onChange(i, { thickness_mm: v ?? 0, glass_composition: "" })} />
            </label>
          </>
        )}
        {(m?.mode === "density" || m?.mode === "surface") && (
          <>
            {/* Verre : la composition additionne deja tous les verres (6/16/6 = 12 mm), le champ ne sert pas.
                Il reste visible seulement si une ancienne saisie l'a mis a autre chose que 1, pour pouvoir le corriger. */}
            {m.category === "verre" && c.faces === 1 ? (
              <p className="w-44 self-center text-xs text-muted-foreground">
                Poids calculé sur l'épaisseur totale de verre{c.thickness_mm > 0 ? ` (${fmt(c.thickness_mm, Number.isInteger(c.thickness_mm) ? 0 : 1)} mm)` : ""}.
              </p>
            ) : (
              <label className="w-24 text-xs text-muted-foreground" title="Nombre de couches identiques : ex. tôle sur les 2 faces d'un caisson = 2">Faces / couches
                <NumInput className="mt-1" digits={0} value={c.faces} invalid={!!e["faces"]} describedBy={errId} onChange={(v) => onChange(i, { faces: v ?? 1 })} />
              </label>
            )}
            <label className="w-36 text-xs text-muted-foreground">Surface perso. (m²)
              <NumInput className="mt-1" allowEmpty placeholder="L × H" digits={3} value={c.custom_area_m2} invalid={!!e["custom_area_m2"]} describedBy={errId} onChange={(v) => onChange(i, { custom_area_m2: v })} />
            </label>
          </>
        )}
        {m?.mode === "linear" && (
          <label className="w-28 text-xs text-muted-foreground">Longueur (m)
            <NumInput className="mt-1" digits={3} value={c.length_m} invalid={!!e["length_m"]} describedBy={errId} onChange={(v) => onChange(i, { length_m: v ?? 0 })} />
          </label>
        )}
        {(m?.mode === "linear" || m?.mode === "unit") && (
          <label className="w-24 text-xs text-muted-foreground">Nombre
            <NumInput className="mt-1" digits={0} value={c.count} invalid={!!e["count"]} describedBy={errId} onChange={(v) => onChange(i, { count: v ?? 0 })} />
          </label>
        )}
        <div className="ml-auto flex gap-1">
          <button className="btn btn-sm" title="Monter" aria-label={`Monter le composant ${i + 1}`} onClick={() => onMove(i, -1)}>↑</button>
          <button className="btn btn-sm" title="Descendre" aria-label={`Descendre le composant ${i + 1}`} onClick={() => onMove(i, 1)}>↓</button>
          <button className="btn btn-sm btn-danger" title="Retirer" aria-label={`Retirer le composant ${i + 1}`} onClick={() => onRemove(i)}>✕</button>
        </div>
      </div>
      <p className="num mt-2 text-left text-xs text-muted-foreground">{formula}</p>
      {!isNaN(glass) && (
        <p className="text-xs text-muted-foreground">Verre {c.glass_composition} → {fmt(glass)} mm de verre (gaz et intercalaire négligés, PVB compté).</p>
      )}
      {msgs.length > 0 && (
        <ul id={errId} className="mt-1 space-y-0.5 text-[0.7rem] text-destructive">
          {msgs.map((t) => <li key={t}>{t.replace(/^Composant \d+ : /, "")}</li>)}
        </ul>
      )}
    </div>
  );
});

/**
 * Liste deroulante des materiaux, memorisee a part : changer la largeur modifie la formule
 * de toutes les lignes, mais pas leurs listes (200 materiaux x 50 lignes = 10 000 options).
 */
const MaterialSelect = memo(function MaterialSelect({
  i, value, deleted, invalid, groups, others, onPick,
}: {
  i: number;
  value: string;
  deleted: Material | undefined;
  invalid: boolean;
  groups: Group[];
  others: Material[];
  onPick: (i: number, id: string) => void;
}) {
  return (
    <select
      className={`field mt-1 text-foreground ${invalid ? "field-error" : ""}`}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(ev) => onPick(i, ev.target.value)}
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
      {deleted && <option value={deleted.id}>{deleted.name} (supprimé)</option>}
    </select>
  );
});
