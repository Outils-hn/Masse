import { memo, useEffect, useState } from "react";
import { parseNum, inputText } from "@/lib/calc";

/** Number field accepting comma, point and Swiss apostrophe. Commits on blur. */
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
  const bad = text.trim() !== "" && isNaN(parseNum(text));
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
        const n = parseNum(e.target.value);
        if (!isNaN(n)) onChange(n);
        else if (allowEmpty && e.target.value.trim() === "") onChange(null);
      }}
      onBlur={() => setFocus(false)}
    />
  );
});
