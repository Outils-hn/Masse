/** Logo : un bloc pose sur son assise couleur brique (le poids). */
export function MasseMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="3.75" y="4.75" width="14.5" height="12.5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground" />
      <rect x="3" y="14" width="16" height="4" fill="var(--color-masse)" />
    </svg>
  );
}
