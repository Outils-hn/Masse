import { useSyncExternalStore, useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const KEY = "masse-pin";
let pin: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function loadPin() {
  if (pin === null && typeof window !== "undefined") pin = sessionStorage.getItem(KEY);
}
export function setPin(p: string | null) {
  pin = p;
  if (p) sessionStorage.setItem(KEY, p);
  else sessionStorage.removeItem(KEY);
  emit();
}
export function usePin() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => (loadPin(), pin),
    () => null,
  );
}

// Prompt plumbing
let resolver: ((v: string | null) => void) | null = null;
let promptOpen = false;
const promptSubs = new Set<() => void>();
function askPin(): Promise<string | null> {
  promptOpen = true;
  promptSubs.forEach((f) => f());
  return new Promise((r) => (resolver = r));
}

export const db = supabase as any;

const OFFLINE_MSG = "Base injoignable : vérifiez la connexion, rien n'a été enregistré.";
const isNetwork = (e: { message?: string } | null | undefined) => /fetch|network|Load failed/i.test(e?.message ?? "");

/** Bouton « Deverrouiller » du bandeau : demande le PIN et le garde pour la session. */
export async function deverrouiller() {
  const p = await askPin();
  if (p) setPin(p);
}

/** Calls a PIN-protected RPC. Returns the result object or null when cancelled / failed. */
export async function write(fn: string, args: Record<string, unknown>): Promise<any | null> {
  loadPin();
  let p = pin;
  if (!p) {
    p = await askPin();
    if (!p) return null;
  }
  const { data, error } = await db.rpc(fn, { p_pin: p, ...args });
  if (error) {
    toast.error(isNetwork(error) ? OFFLINE_MSG : "Erreur : " + error.message);
    return null;
  }
  if (!data?.ok) {
    if (/PIN|essais|Aucun PIN/.test(data?.error ?? "")) setPin(null);
    toast.error(data?.error ?? "Échec de la modification.", { id: "pin" });
    return null;
  }
  setPin(p);
  return data;
}

export function PinDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const f = () => setOpen(promptOpen);
    promptSubs.add(f);
    return () => void promptSubs.delete(f);
  }, []);
  const close = (v: string | null) => {
    promptOpen = false;
    setOpen(false);
    setValue("");
    resolver?.(v);
    resolver = null;
  };
  if (!open) return null;
  const submit = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("verify_pin", { p_pin: value });
    setBusy(false);
    // Meme identifiant de notification : un bon PIN efface le « PIN incorrect » precedent
    if (data?.ok) { toast.dismiss("pin"); close(value); }
    else toast.error(error && isNetwork(error) ? OFFLINE_MSG : (data?.error ?? "PIN incorrect."), { id: "pin" });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => close(null)} onKeyDown={(e) => e.key === "Escape" && close(null)}>
      <div className="panel w-full max-w-sm p-5 shadow-lg" role="dialog" aria-modal="true" aria-labelledby="pin-titre" onClick={(e) => e.stopPropagation()}>
        <h2 id="pin-titre" className="text-base font-semibold">Code PIN requis</h2>
        <p className="mt-2 text-sm text-muted-foreground">La consultation est libre. Le PIN sert à modifier les éléments et la bibliothèque ; il reste valable jusqu'à la fermeture de l'onglet.</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          aria-label="Code PIN"
          className="field mt-4 font-mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => close(null)}>Annuler</button>
          <button className="btn btn-primary" disabled={busy || !value} onClick={submit}>Déverrouiller</button>
        </div>
      </div>
    </div>
  );
}
