import { useEffect, useState } from "react";
import { parseNum, fmt } from "@/lib/calc";

/** Number field accepting comma, point and Swiss apostrophe. Commits on blur. */
export function NumInput({
  value,
  onChange,
  digits = 2,
  allowEmpty,
  className = "",
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  digits?: number;
  allowEmpty?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const show = (v: number | null) => (v == null ? "" : fmt(v, digits).replace(/'/g, "").replace(/,?0+$/, "").replace(/,$/, ""));
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(show(value));
  }, [value, focus]);
  const bad = text.trim() !== "" && isNaN(parseNum(text));
  return (
    <input
      className={`field num ${bad ? "field-error" : ""} ${className}`}
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
}
