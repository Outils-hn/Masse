import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { usePin, setPin } from "@/lib/pin";
import { useData, fmtDate } from "@/lib/queries";
import { SelecteurApplis } from "@/components/masse/SelecteurApplis";
import { MasseMark } from "@/components/masse/MasseMark";
import { AppFooter } from "@/components/masse/AppFooter";
import { Bandeau } from "@/components/masse/Bandeau";

const NAV = [
  { to: "/", label: "Éléments" },
  { to: "/materiaux", label: "Matériaux" },
  { to: "/listes", label: "Listes" },
  { to: "/corbeille", label: "Corbeille & sauvegarde" },
] as const;

const THEME_KEY = "masse-theme";

/**
 * Theme clair / sombre retenu sur l'ordinateur, comme dans les autres applis.
 * La classe est posee avant l'affichage par un petit script (voir __root.tsx) : pas de flash blanc.
 */
function useTheme() {
  const [dark, setDarkState] = useState(false);
  useEffect(() => {
    let d = false;
    try { d = localStorage.getItem(THEME_KEY) === "dark"; } catch { /* stockage bloque */ }
    document.documentElement.classList.toggle("dark", d);
    setDarkState(d);
  }, []);
  const toggle = () => setDarkState((d) => {
    const next = !d;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { /* stockage bloque */ }
    return next;
  });
  return [dark, toggle] as const;
}

export function Shell({ children }: { children: ReactNode }) {
  const pin = usePin();
  const [dark, setDark] = useTheme();
  const { offline, offlineSince } = useData();
  return (
    <div className="flex min-h-screen flex-col">
      <Bandeau
        marque={<>
          <MasseMark />
          <SelecteurApplis />
          <span className="sr-only">Poids des éléments de façade</span>
        </>}
        onglets={NAV.map((n) => (
          <Link key={n.to} to={n.to} className="bandeau-onglet" activeOptions={{ exact: true }}>{n.label}</Link>
        ))}
        statut={pin ? (
          <>
            <span className="bandeau-statut ouvert">Modification déverrouillée</span>
            <button className="bandeau-btn" onClick={() => setPin(null)}>Verrouiller</button>
          </>
        ) : (
          <span className="bandeau-statut">Lecture seule</span>
        )}
        theme={
          <button onClick={setDark} className="bandeau-icone" aria-label="Basculer le thème">
            {dark ? <Sun /> : <Moon />}
          </button>
        }
      />
      {offline && (
        <div role="status" className="border-b border-border bg-muted px-4 py-2 text-center text-xs text-foreground">
          Base de données injoignable : affichage de la copie locale du {fmtDate(offlineSince)}, en lecture seule. Les modifications reprendront au retour de la connexion.
        </div>
      )}
      <main className="page flex-1 py-6">{children}</main>
      <AppFooter />
    </div>
  );
}
