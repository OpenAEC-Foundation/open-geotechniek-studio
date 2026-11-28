import { useTranslation } from "react-i18next";
import { useCalculationsStore } from "../calc/framework/store";
import { getCalcModule } from "../calc/framework/registry";
import { moduleName } from "../calc/framework/moduleText";
import { useCptStore } from "../store/useCptStore";
import { calcSpec } from "./calcGeometry";
import { polylineLength } from "./geometry";
import { calcColor, calcStatus, openCalculation, projectContext, STATUS_COLOR } from "./store";

const f = (v: number, d = 2) => v.toFixed(d).replace(".", ",");

/** Eigenschappen van een geplaatste berekening in het 3D-model, met de knop naar de berekening. */
export function PlacedSelection({ calcId }: { calcId: string }) {
  const { t } = useTranslation("placement");
  const docId = useCptStore((s) => s.activeDocId);
  const calcs = useCalculationsStore((s) => (docId ? s.byDoc.get(docId) : undefined)) ?? [];
  const calc = calcs.find((c) => c.id === calcId);
  if (!calc) return null;
  const mod = getCalcModule(calc.moduleId);
  const spec = calcSpec(calc);
  const st = calcStatus(calc, projectContext(calcs));
  const rows: [string, string][] = [];
  if (spec?.kind === "piles") {
    rows.push([t("props.top", "Paalkop"), `NAP ${f(spec.pile.topNap)} m${spec.pile.topAssumed ? ` (${t("props.assumed", "aangenomen")})` : ""}`]);
    rows.push([t("props.toe", "Paalpunt"), `NAP ${f(spec.pile.toeNap)} m`]);
    rows.push([t("props.size", "Maat"), `${Math.round(spec.pile.sizeM * 1000)} mm ${spec.pile.circular ? "Ø" : "□"}`]);
    if (calc.placement?.kind === "piles") rows.push([t("props.count", "Aantal palen"), String(calc.placement.positions.length)]);
  }
  if (spec?.kind === "wall") {
    rows.push([t("props.wallTop", "Bovenkant wand"), `NAP ${f(spec.wall.topNap)} m`]);
    rows.push([t("props.wallToe", "Teen"), `NAP ${f(spec.wall.toeNap)} m`]);
    rows.push([t("props.excavation", "Ontgraving"), `NAP ${f(spec.wall.excavationNap)} m`]);
    if (spec.wall.profileName) rows.push([t("props.profile", "Profiel"), spec.wall.profileName]);
    if (calc.placement?.kind === "wall") rows.push([calc.placement.closed ? t("props.perimeter", "Omtrek") : t("props.length", "Lengte"), `${f(polylineLength(calc.placement.points, calc.placement.closed), 1)} m`]);
    if (spec.wall.supports.length) rows.push([t("props.supports", "Ankers/stempels"), spec.wall.supports.map((s) => `NAP ${f(s.levelNap)} (${s.kind === "strut" ? t("props.strut", "stempel") : s.kind === "grout" ? t("props.grout", "groutanker") : s.tie ? `${t(`props.tie_${s.tie.type}`, s.tie.type === "wall" ? "ankerstaaf met ankerschot" : s.tie.type === "pile" ? "ankerstaaf met ankerpaal" : "ankerstaaf met ankerplaat")}, ${f(s.lengthM ?? 0, 1)} m` : t("props.tie", "ankerstaaf")})`).join(", ")]);
  }
  if (spec?.kind === "footing") {
    rows.push([t("props.base", "Funderingsvlak"), `NAP ${f(spec.footing.foundationNap)} m`]);
    rows.push([t("props.width", "Breedte"), `${f(spec.footing.widthM)} m`]);
  }
  return (
    <section className="placement-selection">
      <h4><span className="soil3d-props-dot" style={{ background: calcColor(calc.id) }} aria-hidden="true" />{calc.name}</h4>
      <div className="soil3d-props-sub">{mod ? moduleName(mod) : calc.moduleId}</div>
      {st.text && <div className="placement-status" style={{ borderColor: STATUS_COLOR[st.status] }}>{st.text}</div>}
      {rows.length > 0 && <table><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>}
      <button type="button" className="placement-open" onClick={() => openCalculation(calc.id)}>{t("props.open", "Open berekening")}</button>
    </section>
  );
}
