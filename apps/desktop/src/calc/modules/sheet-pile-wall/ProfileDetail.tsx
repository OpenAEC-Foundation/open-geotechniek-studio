// Detail van één dubbele plank in de plattegrond van de wand, op schaal, met de maten uit de profieltabel.
import { useTranslation } from "react-i18next";
import { numberLocale } from "../../i18n";
import type { SheetPileProfile } from "../../library/sheetPiles";
import { drawingContour, sheetContour } from "../../library/sheetPileContour";
import type { CorrodedSheet } from "../../shared/corrosion";

const f = (v: number, d = 0) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Met afroesting: de verkleinde doorsnede gevuld en de oorspronkelijke contour als stippellijn, met boven de hoge en
 * onder de lage zijde en hun dikteverlies. Zonder exacte contour blijft de tekening de oorspronkelijke.
 */
export function ProfileDetail({ profile, corroded }: { profile: SheetPileProfile; corroded?: CorrodedSheet | null }) {
  const { t } = useTranslation("calcWall");
  const rust = corroded && corroded.basis !== "none" ? corroded : null, extra = rust ? 12 : 0;
  const c = sheetContour(profile, 2), g = c.geometry, W = 360, padX = 34, padTop = 22 + extra, k = (W - 2 * padX) / c.widthMm, half = Math.max(g.heightMm / 2, 12), H = padTop + 2 * half * k + 34 + extra;
  const X = (x: number) => padX + x * k, Y = (y: number) => padTop + (half - y) * k, path = (poly: Array<{ x: number; y: number }>) => poly.map((q) => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(" ");
  const table = g.basis === "table", exact = g.basis === "drawing", approx = table ? "" : "≈ ", source = exact ? drawingContour(profile) : undefined;
  const reduced = rust?.polygons && rust.polygons.length === c.plates.length ? rust.polygons : null;
  const mm = (v: number) => f(v, 2);
  return <figure className="sw-detail">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("detail.aria", "Detail van het profiel {{id}}: twee planken in de plattegrond", { id: profile.id })}>
      <line className="sw-detail-axis" x1={X(0) - 8} x2={X(c.widthMm) + 8} y1={Y(0)} y2={Y(0)} />
      {(reduced ?? c.plates).map((poly, n) => <polygon key={n} className="sw-detail-plate" points={path(poly)} />)}
      {c.locks.map((poly, n) => <polygon key={n} className="sw-detail-lock" points={path(poly)} />)}
      {reduced && c.plates.map((poly, n) => <polygon key={`o${n}`} className="sw-detail-orig" points={path(poly)} />)}
      {/* Maatlijnen: plankbreedte b boven, wandhoogte h links. */}
      <path className="sw-detail-dim" d={`M${X(0)},${padTop - 9}H${X(g.widthMm)}M${X(0)},${padTop - 13}v8M${X(g.widthMm)},${padTop - 13}v8`} />
      <text x={X(g.widthMm / 2)} y={padTop - 12} textAnchor="middle">{`b = ${f(g.widthMm)}`}</text>
      {g.heightMm > 0 && <><path className="sw-detail-dim" d={`M${padX - 12},${Y(g.heightMm / 2)}V${Y(-g.heightMm / 2)}M${padX - 16},${Y(g.heightMm / 2)}h8M${padX - 16},${Y(-g.heightMm / 2)}h8`} />
        <text x={padX - 15} y={Y(0) - 3} textAnchor="end">{`h = ${f(g.heightMm)}`}</text></>}
      {rust && <>
        <text className="sw-detail-side" x={padX} y={10}>{t("detail.highSide", "hoge zijde: afroesting {{mm}} mm", { mm: mm(rust.lossPosMm) })}</text>
        <text className="sw-detail-side" x={padX} y={H - 30}>{t("detail.lowSide", "lage zijde: afroesting {{mm}} mm", { mm: mm(rust.lossNegMm) })}</text>
      </>}
      <text x={padX} y={H - 18}>{rust ? `t = ${f(rust.original.flangeMm ?? 0, 1)} → ${mm(rust.profile.flangeMm ?? 0)} · s = ${f(rust.original.webMm ?? 0, 1)} → ${mm(rust.profile.webMm ?? 0)} mm` : `t = ${f(g.flangeThicknessMm, 1)} · s = ${f(g.webThicknessMm, 1)} mm`}</text>
      {!exact && (profile.shape === "Z" || profile.shape === "U") && <text x={W - padX} y={H - 18} textAnchor="end">{`${t("detail.flange", "flens")} ${approx}${f(g.flangeMm)} mm · α ${approx}${f(g.webAngleDeg, 1)}°`}</text>}
      <text className="sw-detail-note" x={W / 2} y={H - 5} textAnchor="middle">{(exact ? t("detail.drawing", "contour uit fabrieks-DWG ({{manufacturer}})", { manufacturer: source?.manufacturer ?? profile.manufacturer }) : table ? t("detail.table", "maten uit de profieltabel; slot schematisch") : g.basis === "derived" ? t("detail.derived", "schematisch: flensbreedte en lijfhoek afgeleid uit A en I; slot als blokje") : t("detail.schematic", "schematisch: alleen b, h en de plaatdikten komen uit de tabel"))
        + (reduced ? `; ${t("detail.corroded", "stippellijn: zonder afroesting")}` : rust ? `; ${t("detail.corrodedApprox", "afroesting benaderd, niet getekend")}` : "")}</text>
    </svg>
  </figure>;
}
