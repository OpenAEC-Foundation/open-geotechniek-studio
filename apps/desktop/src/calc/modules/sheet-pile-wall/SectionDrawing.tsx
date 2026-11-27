// Doorsnede op schaal: wand, grondlagen, waterstanden, steun, bovenbelasting en de gronddruk aan beide zijden,
// met ernaast de lijnen voor verplaatsing, moment en dwarskracht over dezelfde hoogte.
import { useTranslation } from "react-i18next";
import { numberLocale } from "../../i18n";
import type { RunSample, WallInput, WallOk, WallRun } from "./compute";
import { niceTicks, wallScene } from "./scene";

const f = (v: number, d = 1) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });
const napText = (v: number) => `NAP ${v >= 0 ? "+" : "−"}${f(Math.abs(v), 2)}`;

export function SectionDrawing({ input: i, result: r, run }: { input: WallInput; result: WallOk; run: WallRun }) {
  const { t } = useTranslation("calcWall");
  const s = wallScene(i, r, run), top = s.topNap + Math.max(0.3, 0.08 * (s.topNap - s.bottomNap)), bottom = s.bottomNap, half = Math.max(1.2, Math.min(7, 0.42 * (top - bottom)));
  const secW = 330, padL = 78, padT = 16, k = secW / (2 * half), H = padT + (top - bottom) * k + 22;
  const colW = 108, gap = 14, W = padL + secW + 3 * (colW + gap) + 8;
  const X = (x: number) => padL + (x + half) * k, Y = (nap: number) => padT + (top - nap) * k;
  const wallHalf = Math.max(s.wallHeightM / 2, 1.5 / k);

  // Gronddruk: korreldruk plus waterdruk, getekend vanaf de wand naar buiten; één schaal voor beide zijden.
  const total = (row: WallRun["rows"][number], side: "high" | "low") => (side === "high" ? (row.high?.pressureKpa ?? 0) + row.uHighKpa : (row.low?.pressureKpa ?? 0) + row.uLowKpa);
  const pMax = Math.max(1, ...run.rows.map((row) => Math.max(total(row, "high"), total(row, "low"))));
  const pScale = (half - wallHalf - 0.3) * k * 0.8 / pMax;
  const diagram = (side: "high" | "low", value: (row: WallRun["rows"][number]) => number) => {
    const sign = side === "high" ? -1 : 1, x0 = X(sign * wallHalf);
    const pts = run.rows.flatMap((row) => { const x = x0 + sign * Math.min(value(row), pMax * 1.15) * pScale; return [`${x.toFixed(1)},${Y(row.topNap).toFixed(1)}`, `${x.toFixed(1)},${Y(row.bottomNap).toFixed(1)}`]; });
    return `${x0},${Y(s.wallTopNap)} ${pts.join(" ")} ${x0},${Y(s.toeNap)}`;
  };
  const limit = (side: "high" | "low", key: "activeKpa" | "passiveKpa") => {
    const sign = side === "high" ? -1 : 1, x0 = X(sign * wallHalf);
    return run.rows.filter((row) => row[side]).map((row) => `${(x0 + sign * Math.min(row[side]![key] + (side === "high" ? row.uHighKpa : row.uLowKpa), pMax * 1.15) * pScale).toFixed(1)},${Y((row.topNap + row.bottomNap) / 2).toFixed(1)}`).join(" ");
  };

  const level = (nap: number, text: string, cls: string, x0: number, x1: number, anchor: "start" | "end") => (
    <g className={`sw-level ${cls}`} key={`${cls}${text}`}>
      <line x1={X(x0)} x2={X(x1)} y1={Y(nap)} y2={Y(nap)} />
      <text x={anchor === "end" ? X(x0) - 4 : X(x1) + 4} y={Y(nap) + 3} textAnchor={anchor}>{text}</text>
    </g>
  );
  const anchor = s.anchors.length ? (() => {
    const a = (i.anchor.angleDeg * Math.PI) / 180, strut = i.anchor.angleDeg === 0, len = Math.min(half - wallHalf - 0.1, 3.2), dir = strut ? 1 : -1;
    const x1 = dir * wallHalf, x2 = dir * (wallHalf + len * Math.cos(a)), y2 = i.anchor.levelNap - len * Math.sin(a);
    return <g className="sw-anchor"><line x1={X(x1)} y1={Y(i.anchor.levelNap)} x2={X(x2)} y2={Y(y2)} /><circle cx={X(x1)} cy={Y(i.anchor.levelNap)} r={3} />
      <text x={X(x2)} y={Y(y2) + (strut ? -5 : 11)} textAnchor={strut ? "end" : "start"}>{run.anchor ? `${f(run.anchor.axialKn, 0)} kN/m` : ""}</text></g>;
  })() : null;

  const columns: Array<{ key: string; title: string; unit: string; value: (p: RunSample) => number; cls: string }> = [
    { key: "y", title: t("visual.displacement", "Verplaatsing"), unit: "mm", value: (p) => p.yM * 1000, cls: "sw-curve-y" },
    { key: "m", title: t("visual.moment", "Moment"), unit: "kNm/m", value: (p) => p.momentKnM, cls: "sw-curve-m" },
    { key: "v", title: t("visual.shear", "Dwarskracht"), unit: "kN/m", value: (p) => p.shearKn, cls: "sw-curve-v" },
  ];

  return <svg className="sw-section" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("visual.sectionAria", "Doorsnede van de damwand met gronddruk, verplaatsing, moment en dwarskracht")}>
    {s.high.layers.map((l, n) => <g key={`h${n}`}><rect x={X(-half)} y={Y(l.topNap)} width={X(0) - X(-half)} height={Y(l.bottomNap) - Y(l.topNap)} fill={l.color} opacity={0.3} /><text className="sw-layer-name" x={X(-half) + 4} y={Y(l.topNap) + 11}>{l.name}</text></g>)}
    {s.low.layers.map((l, n) => <g key={`l${n}`}><rect x={X(0)} y={Y(l.topNap)} width={X(half) - X(0)} height={Y(l.bottomNap) - Y(l.topNap)} fill={l.color} opacity={0.3} /><text className="sw-layer-name" x={X(half) - 4} y={Y(l.topNap) + 11} textAnchor="end">{l.name}</text></g>)}
    {s.high.waterNap > s.high.surfaceNap && <rect className="sw-water-fill" x={X(-half)} y={Y(s.high.waterNap)} width={X(0) - X(-half)} height={Y(s.high.surfaceNap) - Y(s.high.waterNap)} />}
    {s.low.waterNap > s.low.surfaceNap && <rect className="sw-water-fill" x={X(0)} y={Y(s.low.waterNap)} width={X(half) - X(0)} height={Y(s.low.surfaceNap) - Y(s.low.waterNap)} />}
    <polyline className="sw-ground" points={`${X(-half)},${Y(s.high.surfaceNap)} ${X(-wallHalf)},${Y(s.high.surfaceNap)}`} />
    <polyline className="sw-ground" points={`${X(wallHalf)},${Y(s.low.surfaceNap)} ${X(half)},${Y(s.low.surfaceNap)}`} />
    {s.low.originalNap > s.low.surfaceNap + 0.01 && <line className="sw-original" x1={X(wallHalf)} x2={X(half)} y1={Y(s.low.originalNap)} y2={Y(s.low.originalNap)} />}

    <polygon className="sw-pressure sw-pressure-water" points={diagram("high", (row) => total(row, "high"))} />
    <polygon className="sw-pressure sw-pressure-soil" points={diagram("high", (row) => row.high?.pressureKpa ?? 0)} />
    <polygon className="sw-pressure sw-pressure-water" points={diagram("low", (row) => total(row, "low"))} />
    <polygon className="sw-pressure sw-pressure-soil" points={diagram("low", (row) => row.low?.pressureKpa ?? 0)} />
    <polyline className="sw-limit" points={limit("high", "activeKpa")} /><polyline className="sw-limit" points={limit("low", "passiveKpa")} />

    <rect className={`sw-wall sw-wall-${s.construction}`} x={X(-wallHalf)} y={Y(s.wallTopNap)} width={X(wallHalf) - X(-wallHalf)} height={Y(s.toeNap) - Y(s.wallTopNap)} />
    {s.boards && <rect className="sw-board" x={X(-wallHalf) - Math.max(2, s.boards.thicknessM * k)} y={Y(s.wallTopNap)} width={Math.max(2, s.boards.thicknessM * k)} height={Y(s.boards.bottomNap) - Y(s.wallTopNap)} />}
    {s.waling && <rect className="sw-waling" x={X(wallHalf)} y={Y(s.waling.levelNap) - Math.max(3, s.waling.sizeM * k)} width={Math.max(3, (s.waling.sizeM * k) / 2)} height={Math.max(6, 2 * s.waling.sizeM * k)} />}
    {anchor}
    {s.surchargeKpa > 0 && <g className="sw-surcharge">
      {Array.from({ length: 6 }, (_, n) => { const x = X(-half + ((n + 0.5) * (half - wallHalf)) / 6), y = Y(s.high.surfaceNap); return <path key={n} d={`M${x},${y - 16}V${y - 2}M${x - 3},${y - 7}L${x},${y - 2}L${x + 3},${y - 7}`} />; })}
      <text x={X(-half / 2)} y={Y(s.high.surfaceNap) - 20} textAnchor="middle">{`q = ${f(s.surchargeKpa, 1)} kPa`}</text>
    </g>}
    {level(s.high.surfaceNap, `${t("visual.ground", "mv")} ${napText(s.high.surfaceNap)}`, "sw-level-ground", -half, -half, "end")}
    {level(s.high.waterNap, `${t("visual.water", "water")} ${napText(s.high.waterNap)}`, "sw-level-water", -half, -wallHalf, "end")}
    {level(s.low.surfaceNap, `${napText(s.low.surfaceNap)}`, "sw-level-ground sw-level-in", wallHalf + 0.15, wallHalf + 0.15, "start")}
    {level(s.low.waterNap, "", "sw-level-water", wallHalf, half, "end")}
    {level(s.toeNap, `${t("visual.toe", "teen")} ${napText(s.toeNap)}`, "sw-level-toe", -half, wallHalf, "end")}
    <text className="sw-side" x={X(-half) + 4} y={H - 6}>{t("visual.highSide", "hoge zijde")}</text>
    <text className="sw-side" x={X(half) - 4} y={H - 6} textAnchor="end">{t("visual.lowSide", "lage zijde")}</text>
    <text className="sw-scale" x={X(0)} y={H - 6} textAnchor="middle">{`${t("visual.pressureScale", "gronddruk")}: ${f(pMax, 0)} kPa = ${f(pMax * pScale / k, 2)} m`}</text>

    {columns.map((c, n) => {
      const x0 = padL + secW + gap + n * (colW + gap), values = run.samples.map(c.value), ticks = niceTicks(Math.min(...values), Math.max(...values), 2);
      const lo = ticks[0], hi = ticks[ticks.length - 1], span = hi - lo || 1, cx = (v: number) => x0 + 6 + ((v - lo) / span) * (colW - 12);
      const peak = run.samples.reduce((best, p) => (Math.abs(c.value(p)) > Math.abs(c.value(best)) ? p : best), run.samples[0]);
      return <g key={c.key} className={`sw-column ${c.cls}`}>
        <text className="sw-column-title" x={x0 + colW / 2} y={10} textAnchor="middle">{`${c.title} [${c.unit}]`}</text>
        <rect className="sw-column-frame" x={x0} y={Y(s.wallTopNap)} width={colW} height={Y(s.toeNap) - Y(s.wallTopNap)} />
        <line className="sw-column-zero" x1={cx(0)} x2={cx(0)} y1={Y(s.wallTopNap)} y2={Y(s.toeNap)} />
        <line className="sw-column-level" x1={x0} x2={x0 + colW} y1={Y(s.low.surfaceNap)} y2={Y(s.low.surfaceNap)} />
        {ticks.map((v) => <text key={v} className="sw-tick" x={cx(v)} y={Y(s.toeNap) + 11} textAnchor="middle">{f(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0)}</text>)}
        <polygon className="sw-curve-fill" points={`${cx(0)},${Y(s.wallTopNap)} ${run.samples.map((p) => `${cx(c.value(p)).toFixed(1)},${Y(p.nap).toFixed(1)}`).join(" ")} ${cx(0)},${Y(s.toeNap)}`} />
        <polyline className="sw-curve" points={run.samples.map((p) => `${cx(c.value(p)).toFixed(1)},${Y(p.nap).toFixed(1)}`).join(" ")} />
        <circle className="sw-peak" cx={cx(c.value(peak))} cy={Y(peak.nap)} r={2.5} />
        <text className="sw-peak-text" x={Math.min(x0 + colW - 2, Math.max(x0 + 2, cx(c.value(peak))))} y={Y(peak.nap) - 5} textAnchor={cx(c.value(peak)) > x0 + colW / 2 ? "end" : "start"}>{f(c.value(peak), 1)}</text>
      </g>;
    })}
  </svg>;
}
