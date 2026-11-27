// Invoer van de afroesting van één zijde: geen, uit NEN-EN 1993-5 tabel 4-1 of 4-2 met ontwerplevensduur en milieu,
// of een eigen dikteverlies. Gedeeld door de damwand en de horizontaal belaste paal.
import { useTranslation } from "react-i18next";
import { NumberInput, Row } from "../framework/views/SheetForm";
import { numberLocale } from "../i18n";
import { CORROSION_ENVIRONMENTS, DESIGN_LIVES, NO_CORROSION, faceLossMm, type CorrosionFace, type DesignLife } from "./corrosion";

const mm = (v: number) => v.toLocaleString(numberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function CorrosionFaceInput({ label, face, onChange }: { label: string; face: CorrosionFace | undefined; onChange: (next: CorrosionFace) => void }) {
  const { t } = useTranslation("calc");
  const f = face ?? NO_CORROSION, set = (patch: Partial<CorrosionFace>) => onChange({ ...f, ...patch }), loss = faceLossMm(f);
  return <>
    <Row label={label}><select aria-label={label} value={f.source} onChange={(e) => set({ source: e.target.value as CorrosionFace["source"] })}>
      <option value="none">{t("corrosion.sourceNone", "Geen afroesting")}</option>
      <option value="table">{t("corrosion.sourceTable", "Volgens NEN-EN 1993-5 tabel 4-1 / 4-2")}</option>
      <option value="custom">{t("corrosion.sourceCustom", "Eigen waarde")}</option></select></Row>
    {f.source === "table" && <>
      <Row label={t("corrosion.environment", "Milieu")}><select aria-label={`${t("corrosion.environment", "Milieu")}, ${label}`} value={f.environment} onChange={(e) => set({ environment: e.target.value as CorrosionFace["environment"] })}>
        {(["4-1", "4-2"] as const).map((table) => <optgroup key={table} label={table === "4-1" ? t("corrosion.table41", "Tabel 4-1: in grond") : t("corrosion.table42", "Tabel 4-2: in water")}>
          {CORROSION_ENVIRONMENTS.filter((env) => env.table === table).map((env) => <option key={env.id} value={env.id}>{t(`corrosion.env.${env.id}`, env.nl)}</option>)}</optgroup>)}</select></Row>
      <Row label={t("corrosion.life", "Ontwerplevensduur")} unit={t("corrosion.years", "jaar")}><select aria-label={`${t("corrosion.life", "Ontwerplevensduur")}, ${label}`} value={f.lifeYears} onChange={(e) => set({ lifeYears: Number(e.target.value) as DesignLife })}>
        {DESIGN_LIVES.map((y) => <option key={y} value={y}>{y}</option>)}</select></Row>
      <Row label={t("corrosion.loss", "Dikteverlies")} unit="mm"><span className="cs-readonly">{loss === null ? t("corrosion.noValue", "geen tabelwaarde: kies een eigen waarde") : mm(loss)}</span></Row>
    </>}
    {f.source === "custom" && <Row label={t("corrosion.loss", "Dikteverlies")} unit="mm"><NumberInput label={`${t("corrosion.loss", "Dikteverlies")} [mm], ${label}`} min={0} value={f.customMm} onChange={(v) => set({ customMm: v })} /></Row>}
  </>;
}
