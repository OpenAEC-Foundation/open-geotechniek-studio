import type { jsPDF } from "jspdf";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { classify } from "./browserCore";
type CurveKey = "qc" | "fs" | "rf" | "u2";
type Point = {
    x: number;
    y: number;
};
const limits: Record<CurveKey, number> = { qc: 30, fs: 0.25, rf: 10, u2: 1 };
const units: Record<CurveKey, string> = { qc: "MPa", fs: "MPa", rf: "%", u2: "MPa" };
const colors: Record<CurveKey, string> = { qc: "#1F4FA8", fs: "#D02828", rf: "#000000", u2: "#06B6D4" };
/** Geometry in native plot points, from cpt-core/src/plot/mod.rs. */
export function reportChartModel(cpt: Cpt) {
    const depth = Math.max(1, Math.ceil(cpt.points.reduce((m, p) => Number.isFinite(p.depth) ? Math.max(m, p.depth) : m, 0)));
    const napTop = cpt.metadata.ground_level_nap ?? 0;
    const curves = {} as Record<CurveKey, Point[][]>;
    const overflow: string[] = [];
    for (const key of Object.keys(limits) as CurveKey[]) {
        const segments: Point[][] = [];
        let segment: Point[] = [];
        let maximum = -Infinity, minimum = Infinity;
        for (const p of cpt.points) {
            const value = p[key];
            if (value == null || !Number.isFinite(value) || !Number.isFinite(p.depth)) {
                if (segment.length)
                    segments.push(segment);
                segment = [];
                continue;
            }
            maximum = Math.max(maximum, value);
            minimum = Math.min(minimum, value);
            const clipped = key === "qc" ? value : Math.min(limits[key], Math.max(0, value));
            const x = key === "rf" ? 545 - clipped / 10 * 99
                : 62 + clipped / limits[key] * (key === "fs" ? 161 : 483);
            const nap = napTop - p.depth;
            segment.push({ x, y: 64 + (napTop - nap) / depth * 653 });
        }
        if (segment.length)
            segments.push(segment);
        curves[key] = segments;
        if (maximum > limits[key])
            overflow.push(`${key}: maximum ${maximum.toFixed(3)} ${units[key]} (schaal ${limits[key]})`);
        if (minimum < 0)
            overflow.push(`${key}: minimum ${minimum.toFixed(3)} ${units[key]} (schaal 0)`);
    }
    const napBottom = napTop - depth;
    const step = [.05, .1, .2, .5, 1, 2, 5, 10, 20, 50, 100].find(value => depth / value <= 12) ?? Math.ceil(depth / 10);
    const napTicks: number[] = [];
    for (let index = Math.ceil(napBottom / step); index <= Math.floor(napTop / step); index++) napTicks.push(Number((index * step).toFixed(8)));
    return { napTop, napBottom, napTicks, depth, curves, overflow };
}
export function drawReportChart(doc: jsPDF, cpt: Cpt, project: ProjectMeta): void {
    const chart = reportChartModel(cpt);
    const scale = 210 / 595;
    const x = (v: number) => v * scale;
    const y = (v: number) => v * 297 / 841;
    doc.setFillColor("#FFFFFF");
    doc.rect(0, 0, 210, 297, "F");
    doc.setFontSize(7);
    doc.setDrawColor(190);
    doc.rect(x(62), y(64), 495 * scale, 653 * scale);
    for (const tick of [0, 1, 5, 10, 15, 20, 25, 30]) {
        const xx = x(62 + tick / 30 * 483);
        doc.line(xx, y(64), xx, y(717));
        doc.text(String(tick), xx, y(57));
    }
    for (const nap of chart.napTicks) {
        const yy = y(64 + (chart.napTop - nap) / chart.depth * 653);
        doc.line(x(62), yy, x(557), yy);
        doc.text((nap >= 0 ? '+' : '') + nap.toFixed(2), x(57), yy, { align: 'right' });
    }
    doc.text('NAP [m]', x(42), y(50), { align: 'center' });
    doc.setFontSize(6);
    doc.setTextColor(colors.fs);
    doc.text('Plaatselijke wrijving (MPa)', x(440), y(32), { align: 'right' });
    for (const value of [.05, .10, .15, .20, .25])
        doc.text(value.toFixed(2), x(62 + value / .25 * 161), y(42), { align: 'center' });
    doc.setTextColor(colors.qc);
    doc.text('Conusweerstand (MPa)', x(63), y(46));
    doc.setTextColor(colors.u2);
    doc.text('u2 [MPa] 0 - 1', x(275), y(18));
    doc.setTextColor(colors.rf);
    doc.text('Wrijvingsgetal (%)', x(495.5), y(32), { align: 'center' });
    for (const value of [5, 10])
        doc.text(String(value), x(545 - value / 10 * 99), y(69), { align: 'center' });
    doc.saveGraphicsState();
    doc.rect(x(62), y(64), 495 * scale, 653 * scale);
    doc.clip();
    doc.discardPath();
    for (const key of Object.keys(chart.curves) as CurveKey[]) {
        doc.setDrawColor(colors[key]);
        doc.setLineWidth((key === "rf" ? .4 : key === "u2" ? .5 : .9) * scale);
        doc.setLineDashPattern(key === "u2" ? [2 * scale, 1.5 * scale] : [], 0);
        for (const segment of chart.curves[key]) {
            for (let i = 1; i < segment.length; i++)
                doc.line(x(segment[i - 1].x), y(segment[i - 1].y), x(segment[i].x), y(segment[i].y));
        }
    }
    const bands: {
        top: number;
        bottom: number;
        zone: number;
        color: string;
    }[] = [];
    for (const point of cpt.points) {
        const zone = classify(point.qc, point.rf);
        if (!zone)
            continue;
        const last = bands[bands.length - 1];
        if (last?.zone === zone.number)
            last.bottom = point.depth;
        else
            bands.push({ top: point.depth, bottom: point.depth, zone: zone.number, color: zone.color });
    }
    for (const band of bands) {
        doc.setFillColor(band.color);
        doc.rect(x(547), y(64 + band.top / chart.depth * 653), 10 * scale, (band.bottom - band.top) / chart.depth * 653 * 297 / 841, "F");
    }
    doc.restoreGraphicsState();
    doc.setTextColor(30);
    doc.setDrawColor(0);
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(.2);
    doc.rect(x(24), y(24), 547 * scale, 793 * 297 / 841);
    doc.line(x(24), y(721), x(571), y(721));
    const extra = cpt.metadata.extra ?? {};
    const date = cpt.metadata.date?.split('-').reverse().join('-') ?? extra.STARTDATE ?? extra.FILEDATE ?? '';
    const cone = (extra.MEASUREMENTTEXT ?? '').split('|').map(v => v.split(',').map(t => t.trim())).find(v => v[0] === '4')?.[1] ?? '';
    const left = [['OPDRACHT NR', project.project_number], ['SONDERING', cpt.id], ['DATUM', date + ' ' + (extra.STARTTIME ?? '')], ['OPDRACHTGEVER', project.client], ['OMSCHRIJVING', cpt.metadata.project_name ?? extra.PROJECTNAME ?? '']];
    const right = [['SONDEERMEESTER', ''], ['REFERENTIE NIVO', cpt.metadata.ground_level_nap == null ? '— m NAP' : cpt.metadata.ground_level_nap.toFixed(2) + ' m NAP'], ['CONUS TYPE', cone], ['HELLINGOPNEMER', ''], ['EINDWAARDE HELLING', [...cpt.points].reverse().find(p => p.inclination != null)?.inclination?.toFixed(2) ?? '']];
    doc.setFontSize(7);
    for (const [rows, lx, vx] of [[left, 30, 116], [right, 287.5, 397.5]] as const)
        rows.forEach(([label, value], i) => { doc.setFont('helvetica', 'bold'); doc.text(label, x(lx), y(733 + i * 12)); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(': ' + value, 55)[0], x(vx), y(733 + i * 12)); });
    doc.setFontSize(9);
    doc.text(cpt.metadata.equipment || extra.COMPANYID || extra.Bronhouder || 'Onbekende contractor', 105, y(811), { align: 'center' });
    doc.setFontSize(6);
    doc.text(doc.splitTextToSize(chart.overflow.join('; '), 180), x(62), y(707));
    if (!cpt.points.length)
        doc.text('Geen meetpunten beschikbaar.', 30, 80);
    if (cpt.metadata.ground_level_nap == null)
        doc.text('NAP-referentie ontbreekt; aangenomen maaiveld 0 m NAP.', x(62), y(694));
    const startDepth = cpt.points[0]?.depth ?? 0;
    const mvY = 64 + startDepth / chart.depth * 653;
    doc.text('MV ' + (chart.napTop - startDepth).toFixed(2), x(70), y(mvY - 5));
    doc.line(x(92), y(mvY), x(557), y(mvY));
}
