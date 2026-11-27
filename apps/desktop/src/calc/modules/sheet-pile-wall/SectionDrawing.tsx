// Doorsnede op schaal: wand, grondlagen, waterstanden, steun, bovenbelasting en de gronddruk aan beide zijden,
// met ernaast de lijnen voor verplaatsing, moment en dwarskracht over dezelfde hoogte.
import { useTranslation } from "react-i18next";
import { numberLocale } from "../../i18n";
import type { ResolvedPhase, RunSample, WallInput, WallOk, WallRun } from "./compute";
import { niceTicks, wallScene, type envelopeLines } from "./scene";

const f = (v: number, d = 1) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });
const napText = (v: number) => `NAP ${v >= 0 ? "+" : "−"}${f(Math.abs(v), 2)}`;

/** qc van een sondering over de hoogte [m NAP, MPa], voor de kolom naast de doorsnede. */
export interface QcTrace { side: "high" | "low"; cptId: string; points: Array<{ nap: number; qc: number }> }

export function SectionDrawing({ input: i, result: r, run, phase, envelope, qc }: { input: WallInput; result: WallOk; run: WallRun; phase?: ResolvedPhase; envelope?: ReturnType<typeof envelopeLines>; qc?: QcTrace[] }) {
  const { t } = useTranslation("calcWall");
  const s = wallScene(i, r, run, phase), top = s.topNap + Math.max(0.3, 0.08 * (s.topNap - s.bottomNap)), bottom = s.bottomNap, half = Math.max(1.2, Math.min(7, 0.42 * (s.topNap - s.toeNap + 1)));
  const hi = s.support?.kind === "grout" ? s.extentHighM : half;
  const secW = 330, padL = 78, padT = 16, k = secW / (hi + half), H = padT + (top - bottom) * k + 22;
  const colW = 108, gap = 14, qcW = qc?.length ? colW + gap : 0, W = padL + secW + qcW + 3 * (colW + gap) + 8;
  const X = (x: number) => padL + (x + hi) * k, Y = (nap: number) => padT + (top - nap) * k;
  const wallHalf = Math.max(s.wallHeightM / 2, 1.5 / k);

  // Gronddruk: korreldruk plus waterdruk, getekend vanaf de wand naar buiten; één schaal voor beide zijden.
  const total = (row: WallRun["rows"][number], side: "high" | "low") => (side === "high" ? (row.high?.pressureKpa ?? 0) + row.uHighKpa : (row.low?.pressureKpa ?? 0) + row.uLowKpa);
  const pMax = Math.max(1, ...run.rows.map((row) => Math.max(total(row, "high"), total(row, "low"))));
  const pScale = (Math.min(half, 7) - wallHalf - 0.3) * k * 0.8 / pMax;
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
  const anchor = s.supports.map((sup) => {
    const a = (sup.angleDeg * Math.PI) / 180, strut = sup.kind === "strut", dir = strut ? 1 : -1, free = strut ? Math.min(half - wallHalf - 0.1, sup.freeM) : sup.freeM;
    const at = (len: number) => ({ x: X(dir * (wallHalf + len * Math.cos(a))), y: Y(sup.levelNap - len * Math.sin(a)) }), p1 = at(0), p2 = at(free), p3 = at(free + sup.groutM);
    return <g key={sup.id} className={`sw-anchor sw-anchor-${sup.kind}`}><line className="sw-anchor-free" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
      {sup.groutM > 0 && <line className="sw-anchor-grout" x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} strokeWidth={Math.max(3, sup.groutDiameterM * k)} />}
      <circle cx={p1.x} cy={p1.y} r={3} />
      <text x={p2.x} y={p2.y + (strut ? -5 : 11)} textAnchor={strut ? "end" : "start"}>{sup.forceKnPerM !== null ? `${s.supports.length > 1 ? `${sup.id} ` : ""}${f(sup.forceKnPerM, 0)} kN/m` : ""}</text></g>;
  });
  // Maaiveld van de wand af en de belastingen op afstand, op schaal; buiten het blok afgekapt.
  const ground = (side: -1 | 1, pts: Array<{ xM: number; nap: number }>, reach: number) => {
    const out = pts.filter((p) => p.xM < reach - wallHalf).map((p) => `${X(side * (wallHalf + p.xM)).toFixed(1)},${Y(p.nap).toFixed(1)}`);
    const last = [...pts].reverse().find((p) => p.xM < reach - wallHalf) ?? pts[0];
    return [...out, `${X(side * reach).toFixed(1)},${Y(last.nap).toFixed(1)}`].join(" ");
  };
  const surfaceAt = (pts: Array<{ xM: number; nap: number }>, x: number) => { let nap = pts[0].nap; for (let k = 1; k < pts.length; k++) if (x >= pts[k - 1].xM) nap = x >= pts[k].xM ? pts[k].nap : pts[k - 1].nap + ((x - pts[k - 1].xM) / (pts[k].xM - pts[k - 1].xM)) * (pts[k].nap - pts[k - 1].nap); return nap; };
  const loads = s.loads.map((l, n) => {
    const side = l.side === "high" ? -1 : 1, pts = l.side === "high" ? s.profileHigh : s.profileLow, reach = l.side === "high" ? hi : half;
    const x0 = Math.min(l.fromM, reach - wallHalf), x1 = l.kind === "line" ? x0 : Math.min(Number.isFinite(l.toM) ? l.toM : reach, reach - wallHalf);
    if (x0 >= reach - wallHalf) return null;
    const count = Math.max(2, Math.round(((x1 - x0) * k) / 18)), arrows = l.kind === "line" ? [x0] : Array.from({ length: count }, (_, j) => x0 + ((x1 - x0) * j) / (count - 1));
    return <g key={n} className="sw-surcharge sw-load">{arrows.map((x, j) => { const px = X(side * (wallHalf + x)), py = Y(surfaceAt(pts, x)); return <path key={j} d={`M${px},${py - 16}V${py - 2}M${px - 3},${py - 7}L${px},${py - 2}L${px + 3},${py - 7}`} />; })}
      <text x={X(side * (wallHalf + (x0 + x1) / 2))} y={Y(surfaceAt(pts, (x0 + x1) / 2)) - 20} textAnchor="middle">{`${l.id} ${f(l.value, 0)} ${l.kind === "line" ? "kN/m" : "kPa"}`}</text></g>;
  });
  const slip = s.slip ? <g className="sw-slip"><line x1={X(-wallHalf)} y1={Y(s.toeNap)} x2={X(-wallHalf - s.slip.reachM)} y2={Y(Math.min(s.wallTopNap, s.high.surfaceNap))} />
    <text x={X(-wallHalf - s.slip.reachM / 2) - 4} y={Y((s.toeNap + s.high.surfaceNap) / 2)} textAnchor="end">{`${f(s.slip.angleDeg, 1)}°`}</text></g> : null;

  // Grondlagen: elke laag in haar eigen kleur met een grenslijn; de naam alleen als die niet over de vorige valt.
  const layerBands = (layers: typeof s.high.layers, x0: number, x1: number, tx: number, anchor: "start" | "end", key: string) => {
    let lastText = -Infinity;
    return layers.map((l, n) => {
      const y0 = Y(l.topNap), h = Y(l.bottomNap) - y0, ty = y0 + Math.min(11, h - 1.5), show = h >= 9 && ty - lastText >= 10;
      if (show) lastText = ty;
      return <g key={`${key}${n}`} className="sw-layer"><rect x={x0} y={y0} width={x1 - x0} height={h} fill={l.color} opacity={0.4} />
        {n > 0 && <line className="sw-layer-line" x1={x0} x2={x1} y1={y0} y2={y0} stroke={l.color} />}
        {show && <text className="sw-layer-name" x={tx} y={ty} textAnchor={anchor}>{l.name}</text>}</g>;
    });
  };
  // qc van de gebruikte sondering(en) in een kolom naast de doorsnede, op dezelfde hoogte, met de lagen van de hoge zijde.
  const qcColumn = (() => {
    if (!qc?.length) return null;
    const x0 = padL + secW + gap, inside = qc.map((q) => ({ ...q, points: q.points.filter((p) => p.nap <= top && p.nap >= bottom) }));
    const max = Math.max(1, ...inside.flatMap((q) => q.points.map((p) => p.qc))), ticks = niceTicks(0, max, 2), hiT = ticks[ticks.length - 1] || 1, cx = (v: number) => x0 + 6 + (Math.min(v, hiT) / hiT) * (colW - 12);
    const yTop = Y(Math.min(top, s.high.surfaceNap)), yBot = Y(bottom);
    return <g className="sw-column sw-qc">
      <text className="sw-column-title" x={x0 + colW / 2} y={10} textAnchor="middle">{`qc [MPa]`}</text>
      {s.high.layers.map((l, n) => <rect key={n} x={x0} y={Y(l.topNap)} width={colW} height={Y(l.bottomNap) - Y(l.topNap)} fill={l.color} opacity={0.25} />)}
      <rect className="sw-column-frame" x={x0} y={yTop} width={colW} height={yBot - yTop} />
      {ticks.map((v) => <text key={v} className="sw-tick" x={cx(v)} y={yBot + 11} textAnchor="middle">{f(v, 0)}</text>)}
      {inside.map((q) => <polyline key={q.side} className={`sw-qc-line sw-qc-${q.side}`} points={q.points.map((p) => `${cx(p.qc).toFixed(1)},${Y(p.nap).toFixed(1)}`).join(" ")}><title>{`${q.cptId} (${q.side === "high" ? t("visual.highSide", "hoge zijde") : t("visual.lowSide", "lage zijde")})`}</title></polyline>)}
      {inside.length > 1 && inside.map((q, n) => <text key={q.side} className={`sw-qc-key sw-qc-${q.side}`} x={x0 + 4} y={yTop + 10 + n * 10}>{q.side === "high" ? t("visual.highSide", "hoge zijde") : t("visual.lowSide", "lage zijde")}</text>)}
    </g>;
  })();

  const columns: Array<{ key: string; title: string; unit: string; value: (p: RunSample) => number; cls: string }> = [
    { key: "y", title: t("visual.displacement", "Verplaatsing"), unit: "mm", value: (p) => p.yM * 1000, cls: "sw-curve-y" },
    { key: "m", title: t("visual.moment", "Moment"), unit: "kNm/m", value: (p) => p.momentKnM, cls: "sw-curve-m" },
    { key: "v", title: t("visual.shear", "Dwarskracht"), unit: "kN/m", value: (p) => p.shearKn, cls: "sw-curve-v" },
  ];

  return <svg className="sw-section" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("visual.sectionAria", "Doorsnede van de damwand met gronddruk, verplaatsing, moment en dwarskracht")}>
    {layerBands(s.high.layers, X(-hi), X(0), X(-hi) + 4, "start", "h")}
    {layerBands(s.low.layers, X(0), X(half), X(half) - 4, "end", "l")}
    {s.high.waterNap > s.high.surfaceNap && <rect className="sw-water-fill" x={X(-hi)} y={Y(s.high.waterNap)} width={X(0) - X(-hi)} height={Y(s.high.surfaceNap) - Y(s.high.waterNap)} />}
    {s.low.waterNap > s.low.surfaceNap && <rect className="sw-water-fill" x={X(0)} y={Y(s.low.waterNap)} width={X(half) - X(0)} height={Y(s.low.surfaceNap) - Y(s.low.waterNap)} />}
    <polyline className="sw-ground" points={ground(-1, s.profileHigh, hi)} />
    <polyline className="sw-ground" points={ground(1, s.profileLow, half)} />
    {s.low.originalNap > s.low.surfaceNap + 0.01 && <line className="sw-original" x1={X(wallHalf)} x2={X(half)} y1={Y(s.low.originalNap)} y2={Y(s.low.originalNap)} />}

    <polygon className="sw-pressure sw-pressure-water" points={diagram("high", (row) => total(row, "high"))} />
    <polygon className="sw-pressure sw-pressure-soil" points={diagram("high", (row) => row.high?.pressureKpa ?? 0)} />
    <polygon className="sw-pressure sw-pressure-water" points={diagram("low", (row) => total(row, "low"))} />
    <polygon className="sw-pressure sw-pressure-soil" points={diagram("low", (row) => row.low?.pressureKpa ?? 0)} />
    <polyline className="sw-limit" points={limit("high", "activeKpa")} /><polyline className="sw-limit" points={limit("low", "passiveKpa")} />

    <rect className={`sw-wall sw-wall-${s.construction}`} x={X(-wallHalf)} y={Y(s.wallTopNap)} width={X(wallHalf) - X(-wallHalf)} height={Y(s.toeNap) - Y(s.wallTopNap)} />
    {s.boards && <rect className="sw-board" x={X(-wallHalf) - Math.max(2, s.boards.thicknessM * k)} y={Y(s.wallTopNap)} width={Math.max(2, s.boards.thicknessM * k)} height={Y(s.boards.bottomNap) - Y(s.wallTopNap)} />}
    {s.waling && <rect className="sw-waling" x={X(wallHalf)} y={Y(s.waling.levelNap) - Math.max(3, s.waling.sizeM * k)} width={Math.max(3, (s.waling.sizeM * k) / 2)} height={Math.max(6, 2 * s.waling.sizeM * k)} />}
    {slip}
    {anchor}
    {loads}
    {s.surchargeKpa > 0 && <g className="sw-surcharge">
      {Array.from({ length: 6 }, (_, n) => { const x = X(-hi + ((n + 0.5) * (hi - wallHalf)) / 6), y = Y(s.high.surfaceNap); return <path key={n} d={`M${x},${y - 16}V${y - 2}M${x - 3},${y - 7}L${x},${y - 2}L${x + 3},${y - 7}`} />; })}
      <text x={X(-hi / 2)} y={Y(s.high.surfaceNap) - 20} textAnchor="middle">{`q = ${f(s.surchargeKpa, 1)} kPa`}</text>
    </g>}
    {level(s.high.surfaceNap, `${t("visual.ground", "mv")} ${napText(s.high.surfaceNap)}`, "sw-level-ground", -hi, -hi, "end")}
    {level(s.high.waterNap, `${t("visual.water", "water")} ${napText(s.high.waterNap)}`, "sw-level-water", -hi, -wallHalf, "end")}
    {level(s.low.surfaceNap, `${napText(s.low.surfaceNap)}`, "sw-level-ground sw-level-in", wallHalf + 0.15, wallHalf + 0.15, "start")}
    {level(s.low.waterNap, "", "sw-level-water", wallHalf, half, "end")}
    {level(s.toeNap, `${t("visual.toe", "teen")} ${napText(s.toeNap)}`, "sw-level-toe", -hi, wallHalf, "end")}
    <text className="sw-side" x={X(-hi) + 4} y={H - 6}>{t("visual.highSide", "hoge zijde")}</text>
    <text className="sw-side" x={X(half) - 4} y={H - 6} textAnchor="end">{t("visual.lowSide", "lage zijde")}</text>
    <text className="sw-scale" x={X(0)} y={H - 6} textAnchor="middle">{`${t("visual.pressureScale", "gronddruk")}: ${f(pMax, 0)} kPa = ${f(pMax * pScale / k, 2)} m`}</text>

    {qcColumn}
    {columns.map((c, n) => {
      const band = envelope?.map((e) => ({ nap: e.nap, range: c.key === "y" ? e.y : c.key === "m" ? e.m : e.v }));
      const x0 = padL + secW + qcW + gap + n * (colW + gap), values = [...run.samples.map(c.value), ...(band ?? []).flatMap((e) => e.range)], ticks = niceTicks(Math.min(...values), Math.max(...values), 2);
      const lo = ticks[0], hi = ticks[ticks.length - 1], span = hi - lo || 1, cx = (v: number) => x0 + 6 + ((v - lo) / span) * (colW - 12);
      const peak = run.samples.reduce((best, p) => (Math.abs(c.value(p)) > Math.abs(c.value(best)) ? p : best), run.samples[0]);
      return <g key={c.key} className={`sw-column ${c.cls}`}>
        <text className="sw-column-title" x={x0 + colW / 2} y={10} textAnchor="middle">{`${c.title} [${c.unit}]`}</text>
        <rect className="sw-column-frame" x={x0} y={Y(s.wallTopNap)} width={colW} height={Y(s.toeNap) - Y(s.wallTopNap)} />
        <line className="sw-column-zero" x1={cx(0)} x2={cx(0)} y1={Y(s.wallTopNap)} y2={Y(s.toeNap)} />
        <line className="sw-column-level" x1={x0} x2={x0 + colW} y1={Y(s.low.surfaceNap)} y2={Y(s.low.surfaceNap)} />
        {ticks.map((v) => <text key={v} className="sw-tick" x={cx(v)} y={Y(s.toeNap) + 11} textAnchor="middle">{f(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0)}</text>)}
        {band ? <polygon className="sw-envelope" points={[...band.map((e) => `${cx(e.range[1]).toFixed(1)},${Y(e.nap).toFixed(1)}`), ...[...band].reverse().map((e) => `${cx(e.range[0]).toFixed(1)},${Y(e.nap).toFixed(1)}`)].join(" ")} />
          : <polygon className="sw-curve-fill" points={`${cx(0)},${Y(s.wallTopNap)} ${run.samples.map((p) => `${cx(c.value(p)).toFixed(1)},${Y(p.nap).toFixed(1)}`).join(" ")} ${cx(0)},${Y(s.toeNap)}`} />}
        {!band && <polyline className="sw-curve" points={run.samples.map((p) => `${cx(c.value(p)).toFixed(1)},${Y(p.nap).toFixed(1)}`).join(" ")} />}
        <circle className="sw-peak" cx={cx(c.value(peak))} cy={Y(peak.nap)} r={2.5} />
        <text className="sw-peak-text" x={Math.min(x0 + colW - 2, Math.max(x0 + 2, cx(c.value(peak))))} y={Y(peak.nap) - 5} textAnchor={cx(c.value(peak)) > x0 + colW / 2 ? "end" : "start"}>{f(c.value(peak), 1)}</text>
      </g>;
    })}
  </svg>;
}
