// Grafiek van de waterspanning tegen de tijd (log-as of wortel-tijd) met u_i, u_0, U en t50.
import { useTranslation } from "react-i18next";
import type { DissipationResult } from "./analysis";
import { buildChartModel, type TimeAxis } from "./chart";

const W = 640, H = 360, LEFT = 58, RIGHT = 46, TOP = 14, BOTTOM = 44;

export default function DissipationChart({ result, axis }: { result: DissipationResult; axis: TimeAxis }) {
  const { t } = useTranslation("dissipatie");
  const model = buildChartModel(result, axis);
  if (!model) return <div className="dis-chart-empty">{t("chart.noData", "Te weinig meetwaarden voor een grafiek.")}</div>;
  const w = W - LEFT - RIGHT, h = H - TOP - BOTTOM;
  const px = (v: number) => LEFT + v * w, py = (v: number) => TOP + (1 - v) * h;
  const t50 = result.t50 == null ? "" : result.t50 >= 100 ? result.t50.toFixed(0) : result.t50.toPrecision(3);
  const labelLeft = model.t50X != null && model.t50X > 0.75;
  return (
    <svg className="dis-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("chart.pressure", "Waterspanning u [kPa]")}>
      {model.xTicks.map((tick, i) => (
        <g key={`x${i}`}>
          <line className={tick.minor ? "dis-grid dis-grid-minor" : "dis-grid"} x1={px(tick.at)} x2={px(tick.at)} y1={TOP} y2={TOP + h} />
          {tick.label && <text className="dis-tick" x={px(tick.at)} y={TOP + h + 15} textAnchor="middle">{tick.label}</text>}
        </g>
      ))}
      {model.yTicks.map((tick, i) => (
        <g key={`y${i}`}>
          <line className="dis-grid" x1={LEFT} x2={LEFT + w} y1={py(tick.at)} y2={py(tick.at)} />
          <text className="dis-tick" x={LEFT - 6} y={py(tick.at) + 4} textAnchor="end">{tick.label}</text>
        </g>
      ))}
      {model.uTicks.map((tick, i) => (
        <g key={`u${i}`}>
          <line className="dis-axis" x1={LEFT + w} x2={LEFT + w + 4} y1={py(tick.at)} y2={py(tick.at)} />
          <text className="dis-tick" x={LEFT + w + 7} y={py(tick.at) + 4}>{tick.label}</text>
        </g>
      ))}
      <rect className="dis-frame" x={LEFT} y={TOP} width={w} height={h} />
      <text className="dis-axis-label" x={LEFT + w / 2} y={H - 8} textAnchor="middle">
        {axis === "log" ? t("chart.time", "Tijd t [s] (logaritmisch)") : t("chart.rootTime", "Wortel van de tijd √t [√s]")}
      </text>
      <text className="dis-axis-label" transform={`translate(14 ${TOP + h / 2}) rotate(-90)`} textAnchor="middle">{t("chart.pressure", "Waterspanning u [kPa]")}</text>
      <text className="dis-axis-label" transform={`translate(${W - 6} ${TOP + h / 2}) rotate(-90)`} textAnchor="middle">U [-]</text>

      {model.uiY != null && <>
        <line className="dis-ref" x1={LEFT} x2={LEFT + w} y1={py(model.uiY)} y2={py(model.uiY)} />
        <text className="dis-ref-label" x={LEFT + w - 5} y={py(model.uiY) + (model.uiY > 0.93 ? 14 : -4)} textAnchor="end">u<tspan baselineShift="sub" fontSize="9">i</tspan> = {result.ui!.toFixed(1)} kPa</text>
      </>}
      {model.u0Y != null && <>
        <line className="dis-ref" x1={LEFT} x2={LEFT + w} y1={py(model.u0Y)} y2={py(model.u0Y)} />
        <text className="dis-ref-label" x={LEFT + 5} y={py(model.u0Y) - 4}>u<tspan baselineShift="sub" fontSize="9">0</tspan> = {result.u0!.toFixed(1)} kPa</text>
      </>}
      {model.startX != null && <line className="dis-ref" x1={px(model.startX)} x2={px(model.startX)} y1={TOP} y2={TOP + h} />}
      {model.t50X != null && model.u50Y != null && (
        <polyline className="dis-t50-line" points={`${LEFT},${py(model.u50Y)} ${px(model.t50X)},${py(model.u50Y)} ${px(model.t50X)},${TOP + h}`} />
      )}
      <polyline className="dis-line" points={model.line.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")} />
      {model.line.length <= 80 && model.line.map((p, i) => <circle key={i} className="dis-point" cx={px(p.x)} cy={py(p.y)} r={2.2} />)}
      {model.t50X != null && model.u50Y != null && <>
        <circle className="dis-t50" cx={px(model.t50X)} cy={py(model.u50Y)} r={5} />
        <text className="dis-t50-label" x={px(model.t50X) + (labelLeft ? -9 : 9)} y={py(model.u50Y) - 8} textAnchor={labelLeft ? "end" : "start"}>
          t<tspan baselineShift="sub" fontSize="9">50</tspan> = {t50} s
        </text>
      </>}
    </svg>
  );
}
