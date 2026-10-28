import { useRefresh } from "@/lib/queries";

/** Ecran d'attente ou d'erreur de chargement, commun aux pages (au lieu d'un « Chargement… » sans fin). */
export function Etat({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  const refresh = useRefresh();
  if (isLoading && !error) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  return (
    <div className="panel max-w-lg p-5" role="alert">
      <h2 className="text-base font-semibold">Base de données injoignable</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Vérifiez la connexion internet. Aucune copie locale n'est encore disponible sur cet ordinateur :
        elle sera créée à la prochaine ouverture réussie.
      </p>
      <button className="btn mt-4" onClick={() => refresh()}>Réessayer</button>
    </div>
  );
}
