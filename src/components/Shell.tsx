import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { usePin, setPin } from "@/lib/pin";

const NAV = [
  { to: "/", label: "Éléments" },
  { to: "/materiaux", label: "Matériaux" },
  { to: "/listes", label: "Listes" },
  { to: "/corbeille", label: "Corbeille & sauvegarde" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const pin = usePin();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="font-mono text-xl font-semibold tracking-tight text-heading">
            Masse<span className="text-primary">.</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
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
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="py-6 text-center text-xs text-muted-foreground">Conçu par H. N.</footer>
    </div>
  );
}
