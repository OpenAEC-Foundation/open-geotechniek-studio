import type { LevelChart } from "./selection";

const W = 260, H = 150, PAD = { l: 34, r: 6, t: 8, b: 18 };
const nl = (v: number, d = 1) => v.toFixed(d).replace("-", "−").replace(".", ",");

/** Verloop van de grondwaterstand: een lijn per peilbuis (maandgemiddelden) en de gekozen stand als stippellijn. */
export function LevelChartView({ chart }: { chart: LevelChart }) {
  const pts = chart.series.flatMap((s) => s.points);
  if (!pts.length) return null;
  const t0 = Math.min(...pts.map((p) => p[0])), t1 = Math.max(...pts.map((p) => p[0]));
  const vs = pts.map((p) => p[1]).concat(chart.head === null ? [] : [chart.head]);
  let v0 = Math.min(...vs), v1 = Math.max(...vs);
  if (v1 - v0 < 0.2) { v0 -= 0.1; v1 += 0.1; }
  const pad = (v1 - v0) * 0.06; v0 -= pad; v1 += pad;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((v1 - v) / (v1 - v0)) * (H - PAD.t - PAD.b);
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((s) => (v1 - v0) / s <= 5) ?? 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(v0 / step) * step; v <= v1 + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
  const yearStep = Math.max(1, Math.ceil((y1 - y0 + 1) / 5));
  const years: number[] = [];
  for (let yr = y0 + (y0 === y1 ? 0 : 1); yr <= y1; yr += yearStep) years.push(yr);
  return (
    <svg className="soil3d-level-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Verloop van de grondwaterstand in m NAP">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end">{nl(v, step < 1 ? 1 : 0)}</text>
        </g>
      ))}
      {years.map((yr) => {
        const t = Date.UTC(yr, 0, 1);
        if (t < t0 || t > t1) return null;
        return <g key={yr}><line x1={x(t)} x2={x(t)} y1={H - PAD.b} y2={H - PAD.b + 3} className="axis" /><text x={x(t)} y={H - 5} textAnchor="middle">{yr}</text></g>;
      })}
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis" />
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis" />
      {chart.series.map((s) => (
        <polyline key={s.id} fill="none" stroke={s.color} strokeWidth={1.2} points={s.points.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}>
          <title>{s.id}</title>
        </polyline>
      ))}
      {chart.head !== null && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(chart.head)} y2={y(chart.head)} stroke={chart.headColor} strokeWidth={1.4} strokeDasharray="4 3" />
          <text x={W - PAD.r - 2} y={y(chart.head) - 3} textAnchor="end" fill={chart.headColor}>stand {nl(chart.head, 2)}</text>
        </g>
      )}
    </svg>
  );
}
