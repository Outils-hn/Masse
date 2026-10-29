import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { usePin, setPin } from "@/lib/pin";
import { useData, fmtDate } from "@/lib/queries";
import { SelecteurApplis } from "@/components/masse/SelecteurApplis";
import { MasseMark } from "@/components/masse/MasseMark";
import { AppFooter } from "@/components/masse/AppFooter";

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
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <MasseMark />
            <SelecteurApplis />
            <span className="sr-only">Poids des éléments de façade</span>
          </div>
          <nav aria-label="Sections" className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="nav-link" activeProps={{ className: "nav-link nav-active" }} activeOptions={{ exact: true }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {pin ? (
              <>
                <span className="status status-open">Modification déverrouillée</span>
                <button className="btn btn-sm" onClick={() => setPin(null)}>Verrouiller</button>
              </>
            ) : (
              <span className="status">Lecture seule</span>
            )}
            <button
              onClick={setDark}
              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Basculer le thème"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </header>
      {offline && (
        <div role="status" className="border-b border-border bg-muted px-4 py-2 text-center text-xs text-foreground">
          Base de données injoignable : affichage de la copie locale du {fmtDate(offlineSince)}, en lecture seule. Les modifications reprendront au retour de la connexion.
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <AppFooter />
    </div>
  );
}
