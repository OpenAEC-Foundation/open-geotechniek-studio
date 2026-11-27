// Detail van één dubbele plank in de plattegrond van de wand, op schaal, met de maten uit de profieltabel.
import { useTranslation } from "react-i18next";
import { numberLocale } from "../../i18n";
import type { SheetPileProfile } from "../../library/sheetPiles";
import { sheetContour } from "../../library/sheetPileContour";

const f = (v: number, d = 0) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });

export function ProfileDetail({ profile }: { profile: SheetPileProfile }) {
  const { t } = useTranslation("calcWall");
  const c = sheetContour(profile, 2), g = c.geometry, W = 360, padX = 34, padTop = 22, k = (W - 2 * padX) / c.widthMm, half = Math.max(g.heightMm / 2, 12), H = padTop + 2 * half * k + 34;
  const X = (x: number) => padX + x * k, Y = (y: number) => padTop + (half - y) * k, path = (poly: Array<{ x: number; y: number }>) => poly.map((q) => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(" ");
  const table = g.basis === "table", approx = table ? "" : "≈ ";
  return <figure className="sw-detail">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("detail.aria", "Detail van het profiel {{id}}: twee planken in de plattegrond", { id: profile.id })}>
      <line className="sw-detail-axis" x1={X(0) - 8} x2={X(c.widthMm) + 8} y1={Y(0)} y2={Y(0)} />
      {c.plates.map((poly, n) => <polygon key={n} className="sw-detail-plate" points={path(poly)} />)}
      {c.locks.map((poly, n) => <polygon key={n} className="sw-detail-lock" points={path(poly)} />)}
      {/* Maatlijnen: plankbreedte b boven, wandhoogte h links. */}
      <path className="sw-detail-dim" d={`M${X(0)},${padTop - 9}H${X(g.widthMm)}M${X(0)},${padTop - 13}v8M${X(g.widthMm)},${padTop - 13}v8`} />
      <text x={X(g.widthMm / 2)} y={padTop - 12} textAnchor="middle">{`b = ${f(g.widthMm)}`}</text>
      {g.heightMm > 0 && <><path className="sw-detail-dim" d={`M${padX - 12},${Y(g.heightMm / 2)}V${Y(-g.heightMm / 2)}M${padX - 16},${Y(g.heightMm / 2)}h8M${padX - 16},${Y(-g.heightMm / 2)}h8`} />
        <text x={padX - 15} y={Y(0) - 3} textAnchor="end">{`h = ${f(g.heightMm)}`}</text></>}
      <text x={padX} y={H - 18}>{`t = ${f(g.flangeThicknessMm, 1)} · s = ${f(g.webThicknessMm, 1)} mm`}</text>
      {(profile.shape === "Z" || profile.shape === "U") && <text x={W - padX} y={H - 18} textAnchor="end">{`${t("detail.flange", "flens")} ${approx}${f(g.flangeMm)} mm · α ${approx}${f(g.webAngleDeg, 1)}°`}</text>}
      <text className="sw-detail-note" x={W / 2} y={H - 5} textAnchor="middle">{table ? t("detail.table", "maten uit de profieltabel; slot schematisch") : g.basis === "derived" ? t("detail.derived", "schematisch: flensbreedte en lijfhoek afgeleid uit A en I; slot als blokje") : t("detail.schematic", "schematisch: alleen b, h en de plaatdikten komen uit de tabel")}</text>
    </svg>
  </figure>;
}
