// Doorsnede in de breedterichting: grondlagen, voet, belastingen, effectieve breedte en het
// bezwijkvlak tot de invloedsdiepte. De maten komen uit scene.ts en slip.ts.
import { n, PUNCH_SPREAD_DEG, type SpreadInput, type SpreadOk } from "./compute";
import { spreadScene } from "./scene";
import type { Pt } from "./slip";

const rad = (d: number) => (d * Math.PI) / 180;
const napText = (v: number) => `NAP ${v >= 0 ? "+" : ""}${n(v, 2)}`;

export function SectionDrawing({ input: i, result: r }: { input: SpreadInput; result: SpreadOk }) {
  const s = spreadScene(i, r), B = i.widthM, d = r.dims, zf = i.foundationNap;
  const oneSided = i.hDKn > 0 || i.slopeDeg > 0 || d.eccBM > 1e-6;
  const reach = Math.min(r.drained.aeM, 4 * B);
  // Hetzelfde mechanisme als op het snijvlak van de 3D-weergave.
  const { drained, undrained } = s.mechanism;

  const xR = B / 2 + reach + 0.4 * B, xL = oneSided ? -(B / 2 + 1.3 * B) : -xR;
  const tanBeta = Math.tan(rad(i.slopeDeg)), tanAlpha = Math.tan(rad(i.baseTiltDeg));
  const arrowTop = zf + Math.max(...s.arrows.map((a) => a.from[2]), s.thicknessM);
  const zTop = Math.max(i.groundNap, arrowTop) + 0.25 * B, zBot = zf - s.depthM;
  const W = 500, padL = 88, padR = 12, padT = 14, padB = 16, k = (W - padL - padR) / (xR - xL), H = padT + (zTop - zBot) * k + padB;
  const X = (x: number) => padL + (x - xL) * k, Y = (z: number) => padT + (zTop - z) * k;
  const groundAt = (x: number) => (x > B / 2 ? i.groundNap - (x - B / 2) * tanBeta : i.groundNap);
  const soilOutline = `${X(xL)},${Y(zBot)} ${X(xL)},${Y(i.groundNap)} ${X(B / 2)},${Y(i.groundNap)} ${X(xR)},${Y(groundAt(xR))} ${X(xR)},${Y(zBot)}`;
  const mid = d.eccBM, path = (pts: Pt[]) => pts.map((p) => `${X(mid + p.x).toFixed(1)},${Y(zf - p.z).toFixed(1)}`).join(" ");
  const baseZ = (x: number) => zf + x * tanAlpha, topZ = zf + Math.max(s.thicknessM, (B / 2) * tanAlpha + 0.1);
  const footing = `${X(-B / 2)},${Y(baseZ(-B / 2))} ${X(B / 2)},${Y(baseZ(B / 2))} ${X(B / 2)},${Y(topZ)} ${X(-B / 2)},${Y(topZ)}`;
  const level = (z: number, label: string, cls: string) => <g className={cls}><line x1={padL} x2={W - padR} y1={Y(z)} y2={Y(z)} /><text x={padL - 4} y={Y(z) + 3} textAnchor="end">{label}</text></g>;
  const tan8 = Math.tan(rad(PUNCH_SPREAD_DEG));
  const blockH = 0.14 * B;
  return <svg className="sf-section" viewBox={`0 0 ${W} ${H.toFixed(0)}`} role="img"
    aria-label={`Doorsnede van de fundering: breedte ${n(B)} m, effectieve breedte ${n(d.bRawM)} m, invloedsdiepte ${n(r.drained.zeM)} m, bezwijkvlak tot ${n(drained.maxDepthM)} m diep`}>
    <defs>
      <clipPath id="sf-soil"><polygon points={soilOutline} /></clipPath>
      <clipPath id="sf-view"><rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} /></clipPath>
      {(["v", "h", "r"] as const).map((id) => <marker key={id} id={`sf-arrow-${id}`} className={`sf-head sf-head-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" /></marker>)}
    </defs>
    <g clipPath="url(#sf-soil)">
      {s.layers.map((l, j) => <rect key={j} x={X(xL)} width={X(xR) - X(xL)} y={Y(zf + l.topZ + (j === 0 ? 5 * B : 0))} height={Math.max(0.5, Y(zf + l.bottomZ) - Y(zf + l.topZ + (j === 0 ? 5 * B : 0)))} fill={l.color} opacity={0.42}><title>{l.name}</title></rect>)}
      {s.layers.slice(1).map((l, j) => <line key={j} className="sf-layer-line" x1={X(xL)} x2={X(xR)} y1={Y(zf + l.topZ)} y2={Y(zf + l.topZ)} />)}
    </g>
    {s.layers.map((l, j) => <text key={j} className="sf-layer-name" x={W - padR - 3} y={Math.min(H - padB - 2, Math.max(Y(Math.min(zf + l.topZ, groundAt(xR))) + 10, padT + 10))} textAnchor="end">{l.name}</text>)}
    <polyline className="sf-ground" points={`${X(xL)},${Y(i.groundNap)} ${X(B / 2)},${Y(i.groundNap)} ${X(xR)},${Y(groundAt(xR))}`} />
    {i.slopeDeg > 0 && <text className="sf-note" x={X(B / 2 + 0.6 * reach)} y={Y(groundAt(B / 2 + 0.6 * reach)) - 4}>β = {n(i.slopeDeg, 1)}°</text>}
    {level(i.groundNap, `mv ${napText(i.groundNap)}`, "sf-level")}
    {i.waterNap > zBot && i.waterNap < zTop && level(i.waterNap, `gws ${napText(i.waterNap)}`, "sf-level sf-level-water")}
    {level(zf, `aanleg ${napText(zf)}`, "sf-level")}
    {level(zf - r.drained.zeM, `ze ${napText(zf - r.drained.zeM)}`, "sf-level sf-level-ze")}

    <g clipPath="url(#sf-view)">
      {r.punch.map((p, j) => <g key={j} className="sf-punch">
        <line x1={X(-B / 2)} y1={Y(zf)} x2={X(-B / 2 - p.thicknessM * tan8)} y2={Y(p.levelNap)} /><line x1={X(B / 2)} y1={Y(zf)} x2={X(B / 2 + p.thicknessM * tan8)} y2={Y(p.levelNap)} />
        <line x1={X(-B / 2 - p.thicknessM * tan8)} x2={X(B / 2 + p.thicknessM * tan8)} y1={Y(p.levelNap)} y2={Y(p.levelNap)} />
      </g>)}
      {undrained?.sides.map((side) => <g key={side.dir} className="sf-slip sf-slip-undrained"><polyline points={path(side.wedge)} /><polyline points={path(side.transition)} /><polyline points={path(side.passive.slice(0, 2))} /></g>)}
      {drained.sides.map((side) => <g key={side.dir} className="sf-slip"><polygon className="sf-slip-fill" points={path([...side.wedge.slice(0, 2), ...side.transition, side.passive[1], side.passive[2]])} />
        <polyline points={path(side.wedge)} /><polyline points={path(side.transition)} /><polyline points={path(side.passive)} /></g>)}
    </g>

    <polygon className="sf-footing" points={footing} />
    {i.baseTiltDeg > 0 && <text className="sf-note" x={X(-B / 2) - 4} y={Y(baseZ(-B / 2)) + 3} textAnchor="end">α = {n(i.baseTiltDeg, 1)}°</text>}
    <line className="sf-axis" x1={X(0)} x2={X(0)} y1={Y(topZ) - 6} y2={Y(zf) + 14} />
    <rect className="sf-pressure" x={X(s.effective.x0)} width={X(s.effective.x1) - X(s.effective.x0)} y={Y(zf)} height={blockH * k} />
    <text className="sf-note sf-note-strong" x={(X(s.effective.x0) + X(s.effective.x1)) / 2} y={Y(zf) + blockH * k + 11} textAnchor="middle">b′ = {n(d.bRawM)} m</text>
    {d.eccBM > 1e-6 && <text className="sf-note" x={X(d.eccBM) - 5} y={Y(zf) - 4} textAnchor="end">e = {n(d.eccBM, 2)} m</text>}
    {s.arrows.filter((a) => a.kind !== "H" || i.hDirection === "B" || r.strip).map((a) => <g key={a.kind} className={`sf-load sf-load-${a.kind.toLowerCase()}`}>
      <line x1={X(a.from[0])} y1={Y(zf + a.from[2])} x2={X(a.to[0])} y2={Y(zf + a.to[2])} markerEnd={`url(#sf-arrow-${a.kind.toLowerCase()})`} />
      <text x={X(a.from[0]) + (a.kind === "R" ? -4 : 4)} y={Y(zf + a.from[2]) + (a.kind === "H" ? -4 : 9)} textAnchor={a.kind === "R" ? "end" : "start"}>{a.label}{a.kind === "R" && i.hDKn > 0 ? ` (${n(s.resultantAngleDeg, 1)}°)` : ""}</text>
    </g>)}
    <text className="sf-note" x={X(xR) - 2} y={Y(zf - r.drained.zeM) - 4} textAnchor="end">ze = {n(r.drained.zeM)} m{r.drained.zeManual ? " (vastgezet)" : ""}; ae = {n(r.drained.aeM)} m</text>
  </svg>;
}
