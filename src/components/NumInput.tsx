import { memo, useEffect, useState } from "react";
import { parseCalc, inputText } from "@/lib/calc";

/** Champ numerique : virgule, point, apostrophe suisse, et petits calculs (0.157*0.980). Le resultat remplace le calcul en quittant le champ. */
export const NumInput = memo(function NumInput({
  value,
  onChange,
  digits = 2,
  allowEmpty,
  className = "",
  placeholder,
  invalid,
  describedBy,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  digits?: number;
  allowEmpty?: boolean;
  className?: string;
  placeholder?: string;
  /** Valeur lisible mais hors limites (ex. epaisseur negative) : bordure rouge. */
  invalid?: boolean;
  describedBy?: string;
  /** Libelle pour un champ sans etiquette visible (ex. cellule de tableau). */
  ariaLabel?: string;
}) {
  const show = (v: number | null) => inputText(v, digits);
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(show(value));
  }, [value, focus]);
  const bad = text.trim() !== "" && isNaN(parseCalc(text));
  return (
    <input
      className={`field num ${bad || invalid ? "field-error" : ""} ${className}`}
      aria-invalid={bad || invalid || undefined}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      inputMode="decimal"
      onFocus={() => setFocus(true)}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseCalc(e.target.value);
        if (!isNaN(n)) onChange(n);
        else if (allowEmpty && e.target.value.trim() === "") onChange(null);
      }}
      onBlur={() => setFocus(false)}
    />
  );
});
