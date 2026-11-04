import { useSyncExternalStore, useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

// Masse range ses donnees dans le projet Supabase d'INDEX et se connecte avec le meme compte.
// Cle publique (« anon ») : elle ne donne que les droits prevus par les regles de la base.
export const BASE_URL = "https://ngfzwfbraqkdcocdcmib.supabase.co";
const BASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZnp3ZmJyYXFrZGNvY2RjbWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2Mzg2NTcsImV4cCI6MjA5NTIxNDY1N30.Ikovcm4eWkLvPO_PvkI8C8DJebBT011Rz87k_EYFdbU";
export const INDEX_URL = "https://outils-hn.github.io/Index";
/** Meme cle de stockage qu'Index : la connexion est partagee entre les applis (meme site). */
export const CLE_SESSION = "sb-ngfzwfbraqkdcocdcmib-auth-token";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = createClient(BASE_URL, BASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: CLE_SESSION, storage: typeof window !== "undefined" ? localStorage : undefined },
});

type Etat = { pret: boolean; email: string; uid: string | null; valide: boolean | null };
const SERVEUR: Etat = { pret: false, email: "", uid: null, valide: null };
let etat: Etat = SERVEUR;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let demarre = false;

async function majSession(s: Session | null) {
  const uid = s?.user?.id ?? null;
  if (uid !== etat.uid || !etat.pret) {
    etat = { pret: true, email: s?.user?.email ?? "", uid, valide: null };
    emit();
  }
  if (!uid) return;
  const { data, error } = await db.rpc("is_approved");
  if (!error && etat.uid === uid) { etat = { ...etat, valide: !!data }; emit(); }
}
function demarrer() {
  if (demarre || typeof window === "undefined") return;
  demarre = true;
  db.auth.getSession().then(({ data }: { data: { session: Session | null } }) => majSession(data.session));
  db.auth.onAuthStateChange((_e: string, s: Session | null) => { void majSession(s); });
}
export function useCompte(): Etat {
  useEffect(demarrer, []);
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => etat, () => SERVEUR);
}

export async function connexion(email: string, motDePasse: string): Promise<string | null> {
  const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
  if (!error) return null;
  return /invalid login/i.test(error.message) ? "Email ou mot de passe incorrect." : /confirm/i.test(error.message) ? "Adresse email pas encore confirmée : ouvrez le lien reçu par email." : error.message;
}
export const deconnexion = () => db.auth.signOut();

// Fenetre de connexion, ouverte par le bandeau ou par une tentative de modification
let resolver: ((v: boolean) => void) | null = null;
let ouverte = false;
const dlgSubs = new Set<() => void>();
function demanderConnexion(): Promise<boolean> {
  ouverte = true;
  dlgSubs.forEach((f) => f());
  return new Promise((r) => (resolver = r));
}
export async function seConnecter() { await demanderConnexion(); }

const OFFLINE_MSG = "Base injoignable : vérifiez la connexion, rien n'a été enregistré.";
const isNetwork = (e: { message?: string } | null | undefined) => /fetch|network|Load failed/i.test(e?.message ?? "");

/** Appelle une fonction d'ecriture reservee aux comptes valides. Renvoie le resultat, ou null si annule / refuse. */
export async function write(fn: string, args: Record<string, unknown>): Promise<any | null> {
  demarrer();
  const { data: sess } = await db.auth.getSession();
  if (!sess.session) {
    if (!(await demanderConnexion())) return null;
  }
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    toast.error(isNetwork(error) ? OFFLINE_MSG : "Erreur : " + error.message);
    return null;
  }
  if (!data?.ok) {
    toast.error(data?.error ?? "Échec de la modification.", { id: "compte" });
    return null;
  }
  return data;
}

export function ConnexionDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const f = () => setOpen(ouverte);
    dlgSubs.add(f);
    return () => void dlgSubs.delete(f);
  }, []);
  const close = (ok: boolean) => {
    ouverte = false;
    setOpen(false);
    setMdp("");
    setErreur(null);
    resolver?.(ok);
    resolver = null;
  };
  if (!open) return null;
  const submit = async () => {
    setBusy(true); setErreur(null);
    const e = await connexion(email, mdp);
    setBusy(false);
    if (e) setErreur(e); else close(true);
  };
  const lien = "underline underline-offset-2 hover:text-foreground";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => close(false)} onKeyDown={(e) => e.key === "Escape" && close(false)}>
      <div className="panel w-full max-w-sm p-5 shadow-lg" role="dialog" aria-modal="true" aria-labelledby="connexion-titre" onClick={(e) => e.stopPropagation()}>
        <h2 id="connexion-titre" className="text-base font-semibold">Connexion</h2>
        <p className="mt-2 text-sm text-muted-foreground">La consultation est libre. Pour modifier, connectez-vous avec votre compte Index (mêmes email et mot de passe).</p>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="block text-sm">Email
            <input id="c-email" type="email" autoComplete="username" autoFocus className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">Mot de passe
            <input id="c-mdp" type="password" autoComplete="current-password" className="field mt-1" value={mdp} onChange={(e) => setMdp(e.target.value)} />
          </label>
          {erreur && <p role="alert" className="text-sm text-destructive">{erreur}</p>}
          <p className="text-xs text-muted-foreground">
            Pas encore de compte ? <a className={lien} href={`${INDEX_URL}/auth`} target="_blank" rel="noopener noreferrer">Créer un compte dans Index</a> (un collègue doit ensuite le valider).
            Mot de passe oublié : <a className={lien} href={`${INDEX_URL}/auth`} target="_blank" rel="noopener noreferrer">depuis Index</a>.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => close(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !email || !mdp}>{busy ? "Connexion…" : "Se connecter"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Fichier JSON (sauvegarde) : export ET import reserves aux comptes connectes. */
export function jsonPermis(): boolean {
  if (etat.uid) return true;
  toast.message("Fichier JSON : compte requis", { description: "Sans compte, on ne peut ni exporter ni importer de fichier JSON. Connectez-vous avec votre compte Index." });
  return false;
}
