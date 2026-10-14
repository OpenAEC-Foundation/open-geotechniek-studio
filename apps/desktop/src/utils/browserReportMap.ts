import type { Cpt } from "../types/cpt";
import type { jsPDF } from "jspdf";
export function overviewBounds(cpts: Cpt[], basemap: boolean) {
    const positions = cpts.flatMap(c => c.position && Number.isFinite(c.position.x_rd) && Number.isFinite(c.position.y_rd) ? [c.position] : []);
    if (!positions.length)
        return null;
    const xs = positions.map(p => p.x_rd), ys = positions.map(p => p.y_rd);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const span = Math.max(xmax - xmin, ymax - ymin);
    const half = basemap ? Math.max(span * .7, 150) : Math.max(span, 10) * .6;
    return { xmin: (xmin + xmax) / 2 - half, xmax: (xmin + xmax) / 2 + half, ymin: (ymin + ymax) / 2 - half, ymax: (ymin + ymax) / 2 + half };
}
async function imageBytes(url: string, magic: number[]): Promise<Uint8Array | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
            return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return bytes.length >= 1000 && magic.every((v, i) => bytes[i] === v) ? bytes : null;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
let cached: {
    key: string;
    photo: Uint8Array;
    overlay: Uint8Array | null;
} | null = null;
export async function drawOverviewMap(doc: jsPDF, cpts: Cpt[]): Promise<void> {
    let bounds = overviewBounds(cpts, true);
    if (!bounds) {
        doc.text("Geen locatiegegevens beschikbaar voor de overzichtskaart.", 15, 35);
        return;
    }
    const key = [bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax].map(v => v.toFixed(1)).join(',');
    const query = '?service=WMS&version=1.1.1&request=GetMap&srs=EPSG:28992&bbox=' + key + '&width=1200&height=1200&styles=';
    let images = cached?.key === key ? cached : null;
    if (!images) {
        const [photo, overlay] = await Promise.all([
            imageBytes('https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0' + query + '&layers=Actueel_orthoHR&format=image/jpeg', [255, 216]),
            imageBytes('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0' + query + '&layers=Kadastralekaart&format=image/png&transparent=true', [137, 80, 78, 71])
        ]);
        if (photo)
            images = cached = { key, photo, overlay };
    }
    if (!images)
        bounds = overviewBounds(cpts, false)!;
    const left = 30, top = 50, size = 150;
    if (images) {
        doc.addImage(images.photo, 'JPEG', left, top, size, size);
        if (images.overlay) {
            doc.saveGraphicsState();
            doc.setGState(doc.GState({ opacity: .55 }));
            doc.setFillColor('#FFFFFF');
            doc.rect(left, top, size, size, 'F');
            doc.restoreGraphicsState();
            doc.addImage(images.overlay, 'PNG', left, top, size, size);
        }
    }
    else {
        doc.setFillColor('#FAFAF9');
        doc.rect(left, top, size, size, 'F');
        doc.setDrawColor('#E7E5E4');
        for (let i = 1; i < 4; i++) {
            doc.line(left + size * i / 4, top, left + size * i / 4, top + size);
            doc.line(left, top + size * i / 4, left + size, top + size * i / 4);
        }
        doc.setFontSize(8);
        doc.text('Geen luchtfoto-achtergrond beschikbaar; RD-raster getoond.', 15, 220);
    }
    doc.setDrawColor('#444444');
    doc.rect(left, top, size, size);
    doc.setTextColor('#27272A');
    doc.setFontSize(8);
    for (const cpt of cpts) {
        const p = cpt.position;
        if (!p || !Number.isFinite(p.x_rd) || !Number.isFinite(p.y_rd))
            continue;
        const x = left + (p.x_rd - bounds.xmin) / (bounds.xmax - bounds.xmin) * size, y = top + size - (p.y_rd - bounds.ymin) / (bounds.ymax - bounds.ymin) * size;
        doc.setFillColor('#D97706');
        doc.setDrawColor('#FFFFFF');
        doc.circle(x, y, 1.5, 'FD');
        doc.text(cpt.id, x + 2.5, y + 1);
    }
    doc.setDrawColor('#333333');
    doc.line(174, 65, 174, 55);
    doc.line(174, 55, 172, 58);
    doc.line(174, 55, 176, 58);
    doc.text('N', 173, 70);
    doc.text(`X-RD ${bounds.xmin.toFixed(0)} - ${bounds.xmax.toFixed(0)} m; Y-RD ${bounds.ymin.toFixed(0)} - ${bounds.ymax.toFixed(0)} m`, 30, 208);
}
