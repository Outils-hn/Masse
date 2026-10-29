import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Fenetres de confirmation au style de l'appli (remplacent confirm() du navigateur,
 * comme dans Linear, Format et Trame). Utilisation : `if (!(await ask({ ... }))) return;`
 */
export interface AskOptions {
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}
type Pending = AskOptions & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function ask(opts: AskOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...opts, resolve };
    emit();
  });
}

export function ConfirmHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  const p = current;
  const close = (ok: boolean) => {
    if (!current) return;
    const r = current.resolve;
    current = null;
    emit();
    r(ok);
  };
  return (
    <AlertDialog open={!!p} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{p?.title}</AlertDialogTitle>
          {p?.message ? (
            <AlertDialogDescription className="whitespace-pre-line">{p.message}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">Confirmation</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{p?.cancel ?? "Annuler"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={p?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {p?.confirm ?? "Continuer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Question posee quand on quitte un brouillon non enregistre. */
export const askLeave = (what = "Des modifications") =>
  ask({ title: "Abandonner les modifications ?", message: `${what} ne sont pas enregistrées.`, confirm: "Abandonner", cancel: "Rester", danger: true });
