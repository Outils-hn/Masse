/** Logo : pastille de la couleur de l'appli, avec son pictogramme (meme logo que sur l'Accueil). */
export function MasseMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} className="shrink-0" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="#9A4A3A"/><g transform="translate(4.56 4.56) scale(.62)" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 9h11l2 11h-15z"/><circle cx="12" cy="5.8" r="2.3"/></g></svg>
  );
}
