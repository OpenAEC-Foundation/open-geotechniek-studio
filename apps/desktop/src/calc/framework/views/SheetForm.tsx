// Gedeelde bouwstenen voor invoer in rekenblad-stijl: per onderwerp een
// sectie met een kopje, daaronder rijen met het label links en de invoer
// plus eenheid rechts. Opmaak staat in CalcSheet.css.
import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent, type FocusEvent, type ReactNode } from "react";

/** Sectie met een kopje in de accentkleur, zoals een paragraaf op een rekenblad. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="cs-section"><h4 className="cs-section-title">{title}</h4>{children}</section>;
}

/** Eén invoerregel: label links, invoer en eenheid rechts. */
export function Row({ label, unit, missing, children }: { label: ReactNode; unit?: string; missing?: string; children: ReactNode }) {
  return (
    <div className={`cs-row${missing ? " cs-row--missing" : ""}`}>
      <span className="cs-row-label">{label}</span>
      <span className="cs-row-control">{children}{unit && <span className="cs-row-unit">{unit}</span>}</span>
      {missing && <span className="cs-row-missing">{missing}</span>}
    </div>
  );
}

export function Hint({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <p className={`cs-hint${warn ? " cs-hint--warn" : ""}`}>{children}</p>;
}

/** Inklapbare sectie voor instellingen die je zelden wijzigt. */
export function More({ title, children }: { title: string; children: ReactNode }) {
  return <details className="cs-more"><summary>{title}</summary><div className="cs-more-body">{children}</div></details>;
}

type NumFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
  value: number | string | undefined;
  /** Wordt pas aangeroepen bij Enter of bij het verlaten van het veld, met de genormaliseerde tekst. */
  onChange: (e: { target: { value: string } }) => void;
};
const normalise = (t: string) => t.trim().replace(",", ".");
const isNumber = (t: string) => normalise(t) !== "" && Number.isFinite(Number(normalise(t)));

/**
 * Getalveld dat tijdens het typen niets doorrekent. Tussenstanden als "-",
 * "-1" of "8," blijven lokaal; Enter of het veld verlaten neemt de waarde
 * over, Esc zet hem terug. Een ongeldige waarde wordt niet overgenomen en
 * krijgt een rode rand. Leeg maken mag alleen bij een optioneel veld (met
 * een plaatshouder). Werkt als vervanger van <input type="number">: de
 * bestaande handlers krijgen { target: { value } } en lezen e.target.value.
 */
export const NumField = forwardRef<HTMLInputElement, NumFieldProps>(function NumField({ value, onChange, onBlur, onKeyDown, placeholder, ...rest }, ref) {
  const shown = value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value)) ? "" : String(value);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const t = normalise(draft);
    setDraft(null);
    if (t === normalise(shown)) return;
    if (t === "" ? placeholder !== undefined : isNumber(t)) onChange({ target: { value: t === "" ? "" : String(Number(t)) } });
  };
  const invalid = draft !== null && !(normalise(draft) === "" ? placeholder !== undefined : isNumber(draft));
  return <input ref={ref} {...rest} placeholder={placeholder} type="text" inputMode="decimal" autoComplete="off"
    value={draft ?? shown} aria-invalid={invalid || rest["aria-invalid"] || undefined}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={(e: FocusEvent<HTMLInputElement>) => { commit(); onBlur?.(e); }}
    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") setDraft(null); onKeyDown?.(e); }} />;
});

/** Getalveld met een getal als uitkomst; een leeg of ongeldig veld wordt niet doorgegeven. */
export function NumberInput({ value, onChange, label, min }: { value: number | undefined; onChange: (v: number) => void; label: string; step?: string; min?: number }) {
  return <NumField aria-label={label} value={value} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v) && (min === undefined || v >= min)) onChange(v); }} />;
}
