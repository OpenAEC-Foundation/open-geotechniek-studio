// Gedeelde bouwstenen voor invoer in rekenblad-stijl: per onderwerp een
// sectie met een kopje, daaronder rijen met het label links en de invoer
// plus eenheid rechts. Opmaak staat in CalcSheet.css.
import type { ReactNode } from "react";

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

/** Getalveld; een leeg of ongeldig veld wordt niet doorgegeven. */
export function NumberInput({ value, onChange, label, step = "any", min }: { value: number | undefined; onChange: (v: number) => void; label: string; step?: string; min?: number }) {
  return <input type="number" step={step} min={min} aria-label={label} value={value !== undefined && Number.isFinite(value) ? value : ""}
    onChange={(e) => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) onChange(v); }} />;
}
