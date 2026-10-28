import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { db } from "./pin";
import type { Material, ElementData, Component } from "./calc";

export interface ElementRow extends ElementData { id: string; updated_at: string; deleted_at: string | null }
export interface ListRow { id: string; name: string; updated_at: string; deleted_at: string | null; items: { element_id: string; quantity: number }[] }

async function fetchAll() {
  const [m, e, c, l, li] = await Promise.all([
    db.from("materials").select("*").order("name"),
    db.from("elements").select("*").order("name"),
    db.from("components").select("*").order("position"),
    db.from("lists").select("*").order("name"),
    db.from("list_items").select("*").order("position"),
  ]);
  const err = m.error || e.error || c.error || l.error || li.error;
  if (err) throw err;
  const materials: Material[] = m.data.map((x: any) => ({ ...x, value: Number(x.value) }));
  const elements: ElementRow[] = e.data.map((x: any) => ({
    ...x,
    length_mm: Number(x.length_mm),
    height_mm: Number(x.height_mm),
    markup_pct: Number(x.markup_pct),
    components: c.data
      .filter((k: any) => k.element_id === x.id)
      .map((k: any): Component => ({
        material_id: k.material_id,
        label: k.label,
        thickness_mm: Number(k.thickness_mm),
        faces: Number(k.faces),
        length_m: Number(k.length_m),
        count: Number(k.count),
        custom_area_m2: k.custom_area_m2 == null ? null : Number(k.custom_area_m2),
        glass_composition: k.glass_composition,
      })),
  }));
  const lists: ListRow[] = l.data.map((x: any) => ({
    ...x,
    items: li.data.filter((i: any) => i.list_id === x.id).map((i: any) => ({ element_id: i.element_id, quantity: Number(i.quantity) })),
  }));
  const out = { materials, elements, lists, raw: { materials: m.data, elements: e.data, components: c.data, lists: l.data, list_items: li.data } };
  writeCache(out);
  return out;
}

type AllData = Awaited<ReturnType<typeof fetchAll>>;

// Copie locale de la derniere lecture reussie : si la base est injoignable (pas de reseau,
// Supabase en panne), l'appli reste consultable en lecture seule au lieu de rester sur « Chargement… ».
const CACHE_KEY = "masse:copie-locale:v1";
function writeCache(data: AllData) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), data })); } catch { /* stockage plein ou bloque */ }
}
function readCache(): { at: string; data: AllData } | null {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useData() {
  const q = useQuery({ queryKey: ["all"], queryFn: fetchAll, retry: 1, retryDelay: 800 });
  const failed = !!q.error && !q.data;
  const cached = useMemo(() => (failed ? readCache() : null), [failed]);
  if (failed && cached) return { ...q, data: cached.data, error: null, isLoading: false, offline: true as const, offlineSince: cached.at };
  return { ...q, offline: false as const, offlineSince: null };
}
export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["all"] });
}

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" }) : "—";

export async function copyText(t: string) {
  await navigator.clipboard.writeText(t);
}
